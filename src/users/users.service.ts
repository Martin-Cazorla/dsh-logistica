// dsh-logistica/src/users/users.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/user.dto';

const BCRYPT_ROUNDS = 10;

/** Nunca se devuelve el hash de contraseña. */
const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

function toView(user: PublicUser) {
  return { ...user, fullName: `${user.firstName} ${user.lastName}`.trim() };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: {
    role?: UserRole;
    isActive?: boolean;
    search?: string;
  }) {
    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    const term = filters.search?.trim();
    if (term) {
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    });
    return users.map(toView);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return toView(user);
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            password: hash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: dto.role,
            isActive: true,
          },
          select: USER_PUBLIC_SELECT,
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.USER_CREATED,
            entityType: AuditEntity.USER,
            entityId: user.id,
            metadata: { email: user.email, role: user.role },
          },
          tx,
        );

        return toView(user);
      });
    } catch (error) {
      this.rethrowUnique(error, dto.email);
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id },
          select: USER_PUBLIC_SELECT,
        });
        if (!current) throw new NotFoundException('Usuario no encontrado.');

        if (dto.role && dto.role !== current.role) {
          if (id === actor.id) {
            throw new BadRequestException('No puede modificar su propio rol.');
          }
          if (current.role === UserRole.ADMIN) {
            await this.assertAnotherActiveAdmin(tx, id);
          }
        }

        const updated = await tx.user.update({
          where: { id },
          data: {
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: dto.role,
          },
          select: USER_PUBLIC_SELECT,
        });

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of ['email', 'firstName', 'lastName', 'role'] as const) {
          if (dto[key] !== undefined && dto[key] !== current[key]) {
            changes[key] = { from: current[key], to: updated[key] };
          }
        }

        await this.audit.log(
          {
            actor,
            action: AuditAction.USER_UPDATED,
            entityType: AuditEntity.USER,
            entityId: id,
            metadata: { changes },
          },
          tx,
        );

        return toView(updated);
      });
    } catch (error) {
      this.rethrowUnique(error, dto.email);
    }
  }

  async setStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
  ) {
    if (id === actor.id && !dto.isActive) {
      throw new BadRequestException('No puede desactivar su propio usuario.');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id },
        select: USER_PUBLIC_SELECT,
      });
      if (!current) throw new NotFoundException('Usuario no encontrado.');

      if (!dto.isActive && current.role === UserRole.ADMIN) {
        await this.assertAnotherActiveAdmin(tx, id);
      }

      if (!dto.isActive) {
        await this.assertNoActiveWork(tx, id);
      }

      const updated = await tx.user.update({
        where: { id },
        data: { isActive: dto.isActive },
        select: USER_PUBLIC_SELECT,
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.USER_STATUS_CHANGED,
          entityType: AuditEntity.USER,
          entityId: id,
          metadata: { isActive: dto.isActive },
        },
        tx,
      );

      return toView(updated);
    });
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: AuthenticatedUser,
  ) {
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Usuario no encontrado.');

      await tx.user.update({ where: { id }, data: { password: hash } });

      await this.audit.log(
        {
          actor,
          action: AuditAction.USER_PASSWORD_RESET,
          entityType: AuditEntity.USER,
          entityId: id,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Bloqueo pesimista de los ADMIN activos para que dos administradores no se
   * degraden mutuamente en paralelo dejando el sistema sin administradores.
   */
  private async assertAnotherActiveAdmin(
    tx: Prisma.TransactionClient,
    excludeId: string,
  ) {
    const admins = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE role = 'ADMIN' AND is_active = true AND id <> ${excludeId}::uuid
      FOR UPDATE
    `;
    if (admins.length === 0) {
      throw new BadRequestException(
        'Debe existir al menos otro administrador activo.',
      );
    }
  }

  private async assertNoActiveWork(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const activeRoutes = await tx.route.count({
      where: {
        OR: [{ driverId: userId }, { helperId: userId }],
        status: { in: ['LOADING', 'IN_TRANSIT'] },
      },
    });
    if (activeRoutes > 0) {
      throw new BadRequestException(
        'El usuario tiene una hoja de ruta en curso. Finalícela o reasígnela antes de desactivarlo.',
      );
    }
  }

  private rethrowUnique(error: unknown, email?: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `Ya existe un usuario con el correo "${email ?? ''}".`,
      );
    }
    throw error;
  }
}
