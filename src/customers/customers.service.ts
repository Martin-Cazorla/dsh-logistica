import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { Prisma } from '@prisma/client';

/** Sólo direcciones activas, con la principal primero. */
const ACTIVE_ADDRESSES = {
  where: { isActive: true },
  orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
} satisfies Prisma.Customer$addressesArgs;

type AddressData = Omit<CreateCustomerAddressDto, 'id'>;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Regla de negocio: al menos 1 dirección y EXACTAMENTE 1 principal.
   * Si ninguna viene marcada como principal, se marca la primera.
   */
  private normalizeAddresses<T extends CreateCustomerAddressDto>(
    addresses: T[] | undefined,
  ): T[] {
    if (!addresses || addresses.length === 0) {
      throw new BadRequestException(
        'El cliente debe tener al menos una dirección de entrega.',
      );
    }
    const defaults = addresses.filter((a) => a.isDefault === true).length;
    if (defaults > 1) {
      throw new BadRequestException(
        'Sólo una dirección puede estar marcada como principal.',
      );
    }
    return addresses.map((a, i) => ({
      ...a,
      alias: a.alias?.trim() || undefined,
      isDefault: defaults === 0 ? i === 0 : a.isDefault === true,
    }));
  }

  private toAddressData(addr: CreateCustomerAddressDto): AddressData {
    const { id: _id, ...data } = addr;
    return data;
  }

  private rethrow(error: unknown, fallback: string): never {
    if (error instanceof HttpException) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Conflicto de valores únicos (CUIT o Número de cliente ya existente)',
      );
    }
    throw new InternalServerErrorException(fallback);
  }

  async create(createCustomerDto: CreateCustomerDto, actor: AuthenticatedUser) {
    const { addresses: rawAddresses, ...customerData } = createCustomerDto;
    const addresses = this.normalizeAddresses(rawAddresses);

    const existingByCuit = await this.prisma.customer.findUnique({
      where: { cuit: customerData.cuit },
    });
    if (existingByCuit) {
      throw new ConflictException(
        `Ya existe un cliente registrado con el CUIT ${customerData.cuit}`,
      );
    }

    const existingByNum = await this.prisma.customer.findUnique({
      where: { customerNumber: customerData.customerNumber },
    });
    if (existingByNum) {
      throw new ConflictException(
        `Ya existe un cliente con el código ${customerData.customerNumber}`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            ...customerData,
            addresses: {
              create: addresses.map((a) => this.toAddressData(a)),
            },
          },
          include: {
            addresses: ACTIVE_ADDRESSES,
            transport: true,
          },
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.CUSTOMER_CREATED,
            entityType: AuditEntity.CUSTOMER,
            entityId: customer.id,
            metadata: {
              customerNumber: customer.customerNumber,
              name: customer.name,
              addresses: customer.addresses.length,
            },
          },
          tx,
        );

        return customer;
      });
    } catch (error) {
      this.rethrow(error, 'Error al crear el cliente en la base de datos');
    }
  }

  async findAll(query: {
    search?: string;
    page?: number;
    limit?: number;
    isActive?: boolean;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = String(query.isActive) === 'true';
    }

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { legalName: { contains: searchTerm, mode: 'insensitive' } },
        { cuit: { contains: searchTerm, mode: 'insensitive' } },
        { customerNumber: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: {
          addresses: ACTIVE_ADDRESSES,
          transport: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: ACTIVE_ADDRESSES,
        transport: true,
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${id} no fue encontrado`);
    }

    return customer;
  }

  /**
   * Actualiza los datos del cliente y SINCRONIZA sus direcciones (no las
   * borra y recrea, para no romper la trazabilidad de los pedidos):
   * - con id    → update (si estaba desactivada, se reactiva);
   * - sin id    → create;
   * - ausentes  → con pedidos asociados se desactivan; sin pedidos se borran.
   */
  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    actor: AuthenticatedUser,
  ) {
    const { addresses: rawAddresses, ...customerData } = updateCustomerDto;
    const addresses =
      rawAddresses !== undefined
        ? this.normalizeAddresses(rawAddresses)
        : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.customer.findUnique({
          where: { id },
          include: {
            addresses: {
              include: { _count: { select: { orders: true } } },
            },
          },
        });
        if (!current) {
          throw new NotFoundException(`Cliente con ID ${id} no fue encontrado`);
        }

        const summary = {
          created: [] as string[],
          updated: [] as string[],
          deactivated: [] as string[],
          deleted: [] as string[],
        };

        if (addresses) {
          const ownIds = new Set(current.addresses.map((a) => a.id));
          const incomingIds = addresses
            .map((a) => a.id)
            .filter((x): x is string => !!x);

          if (new Set(incomingIds).size !== incomingIds.length) {
            throw new BadRequestException(
              'Hay direcciones repetidas en la solicitud.',
            );
          }
          const foreign = incomingIds.filter((x) => !ownIds.has(x));
          if (foreign.length > 0) {
            throw new BadRequestException(
              'Una o más direcciones no pertenecen al cliente que se está editando.',
            );
          }

          // Direcciones activas que ya no vienen: desactivar o borrar.
          const keep = new Set(incomingIds);
          for (const addr of current.addresses) {
            if (!addr.isActive || keep.has(addr.id)) continue;
            if (addr._count.orders > 0) {
              await tx.customerAddress.update({
                where: { id: addr.id },
                data: { isActive: false, isDefault: false },
              });
              summary.deactivated.push(addr.id);
            } else {
              await tx.customerAddress.delete({ where: { id: addr.id } });
              summary.deleted.push(addr.id);
            }
          }

          for (const addr of addresses) {
            const data = this.toAddressData(addr);
            if (addr.id) {
              await tx.customerAddress.update({
                where: { id: addr.id },
                data: { ...data, alias: data.alias ?? null, isActive: true },
              });
              summary.updated.push(addr.id);
            } else {
              const created = await tx.customerAddress.create({
                data: { ...data, customerId: id },
              });
              summary.created.push(created.id);
            }
          }
        }

        const updated = await tx.customer.update({
          where: { id },
          data: customerData,
          include: {
            addresses: ACTIVE_ADDRESSES,
            transport: true,
          },
        });

        // Verificación final del invariante (defensa ante datos previos).
        const defaults = updated.addresses.filter((a) => a.isDefault).length;
        if (updated.addresses.length === 0 || defaults !== 1) {
          throw new BadRequestException(
            'El cliente debe tener al menos una dirección activa y exactamente una principal.',
          );
        }

        const { addresses: _before, ...currentData } = current;
        await this.audit.log(
          {
            actor,
            action: AuditAction.CUSTOMER_UPDATED,
            entityType: AuditEntity.CUSTOMER,
            entityId: id,
            metadata: {
              before: {
                ...currentData,
                addresses: current.addresses
                  .filter((a) => a.isActive)
                  .map(({ _count, ...a }) => a),
              },
              changes: customerData,
              addresses: addresses ? summary : undefined,
            },
          },
          tx,
        );

        return updated;
      });
    } catch (error) {
      this.rethrow(error, 'Error al actualizar la información del cliente');
    }
  }

  async remove(id: string, actor: AuthenticatedUser) {
    await this.findOne(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.update({
          where: { id },
          data: { isActive: false },
        });
        await this.audit.log(
          {
            actor,
            action: AuditAction.CUSTOMER_DEACTIVATED,
            entityType: AuditEntity.CUSTOMER,
            entityId: id,
          },
          tx,
        );
        return customer;
      });
    } catch (error) {
      this.rethrow(error, 'Error al dar de baja el cliente');
    }
  }
}
