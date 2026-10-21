import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const { addresses, ...customerData } = createCustomerDto;

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
      return await this.prisma.customer.create({
        data: {
          ...customerData,
          addresses: {
            create: addresses,
          },
        },
        include: {
          addresses: true,
          transport: true,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Error al crear el cliente en la base de datos',
      );
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
          addresses: true,
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
        addresses: true,
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

  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    await this.findOne(id);

    const { addresses, ...customerData } = updateCustomerDto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (addresses && addresses.length > 0) {
          await tx.customerAddress.deleteMany({
            where: { customerId: id },
          });

          await tx.customerAddress.createMany({
            data: addresses.map((addr) => ({
              ...addr,
              customerId: id,
            })),
          });
        }

        return await tx.customer.update({
          where: { id },
          data: customerData,
          include: {
            addresses: true,
            transport: true,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Conflicto de valores únicos (CUIT o Número de cliente ya existente)',
          );
        }
      }
      throw new InternalServerErrorException(
        'Error al actualizar la información del cliente',
      );
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      throw new InternalServerErrorException('Error al dar de baja el cliente');
    }
  }
}
