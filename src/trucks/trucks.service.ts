// dsh-logistica/src/trucks/trucks.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RouteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateTruckDto, UpdateTruckDto } from './dto/truck.dto';

const ACTIVE_ROUTE_STATUSES: RouteStatus[] = [
  RouteStatus.PLANNED,
  RouteStatus.LOADING,
  RouteStatus.IN_TRANSIT,
];

type TruckRow = Prisma.TruckGetPayload<object>;

function toView(
  truck: TruckRow,
  activeRoute?: { id: string; code: string; status: RouteStatus } | null,
) {
  return {
    id: truck.id,
    brand: truck.brand,
    model: truck.model,
    plate: truck.plate,
    capacityM3: Number(truck.capacityM3),
    maxLoadKg: Number(truck.maxLoadKg),
    isActive: truck.isActive,
    notes: truck.notes,
    activeRoute: activeRoute ?? null,
    createdAt: truck.createdAt,
    updatedAt: truck.updatedAt,
  };
}

@Injectable()
export class TrucksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(onlyActive = false) {
    const trucks = await this.prisma.truck.findMany({
      where: onlyActive ? { isActive: true } : {},
      include: {
        routes: {
          where: { status: { in: ACTIVE_ROUTE_STATUSES } },
          select: { id: true, code: true, status: true },
          take: 1,
          orderBy: { scheduledDate: 'asc' },
        },
      },
      orderBy: [{ isActive: 'desc' }, { plate: 'asc' }],
    });
    return trucks.map(({ routes, ...t }) => toView(t, routes[0]));
  }

  async findOne(id: string) {
    const truck = await this.prisma.truck.findUnique({ where: { id } });
    if (!truck) throw new NotFoundException('Camión no encontrado.');
    return toView(truck);
  }

  async create(dto: CreateTruckDto, actor: AuthenticatedUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const truck = await tx.truck.create({
          data: {
            brand: dto.brand,
            model: dto.model,
            plate: dto.plate,
            capacityM3: new Prisma.Decimal(dto.capacityM3),
            maxLoadKg: new Prisma.Decimal(dto.maxLoadKg),
            notes: dto.notes || null,
          },
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.TRUCK_CREATED,
            entityType: AuditEntity.TRUCK,
            entityId: truck.id,
            metadata: {
              plate: truck.plate,
              capacityM3: dto.capacityM3,
              maxLoadKg: dto.maxLoadKg,
            },
          },
          tx,
        );

        return toView(truck);
      });
    } catch (error) {
      this.rethrowUnique(error, dto.plate);
    }
  }

  async update(id: string, dto: UpdateTruckDto, actor: AuthenticatedUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.truck.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Camión no encontrado.');

        if (dto.isActive === false && current.isActive) {
          const active = await tx.route.count({
            where: { truckId: id, status: { in: ACTIVE_ROUTE_STATUSES } },
          });
          if (active > 0) {
            throw new BadRequestException(
              'El camión tiene hojas de ruta activas; no puede darse de baja.',
            );
          }
        }

        const updated = await tx.truck.update({
          where: { id },
          data: {
            brand: dto.brand,
            model: dto.model,
            plate: dto.plate,
            capacityM3:
              dto.capacityM3 !== undefined
                ? new Prisma.Decimal(dto.capacityM3)
                : undefined,
            maxLoadKg:
              dto.maxLoadKg !== undefined
                ? new Prisma.Decimal(dto.maxLoadKg)
                : undefined,
            notes: dto.notes,
            isActive: dto.isActive,
          },
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.TRUCK_UPDATED,
            entityType: AuditEntity.TRUCK,
            entityId: id,
            metadata: {
              before: toView(current),
              changes: dto as unknown as Record<string, unknown>,
            },
          },
          tx,
        );

        return toView(updated);
      });
    } catch (error) {
      this.rethrowUnique(error, dto.plate);
    }
  }

  private rethrowUnique(error: unknown, plate?: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `Ya existe un camión con la patente "${plate ?? ''}".`,
      );
    }
    throw error;
  }
}
