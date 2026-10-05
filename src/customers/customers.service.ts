import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerDto,
  CreateCustomerAddressDto,
} from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const {
      customerNumber,
      cuit,
      name,
      legalName,
      email,
      phone,
      taxCondition,
      transportId,
      addresses,
    } = createCustomerDto;

    // Validar unicidad por customerNumber o CUIT
    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        OR: [{ customerNumber }, { cuit }],
      },
    });

    if (existingCustomer) {
      throw new ConflictException(
        `Ya existe un cliente con el número "${customerNumber}" o CUIT "${cuit}".`,
      );
    }

    return this.prisma.customer.create({
      data: {
        customerNumber,
        cuit,
        name,
        legalName,
        email,
        phone: phone ?? null,
        taxCondition,
        transportId: transportId ?? null,
        addresses: {
          create: addresses.map((addr: CreateCustomerAddressDto) => ({
            address: addr.address,
            city: addr.city,
            province: addr.province,
            zipCode: addr.zipCode,
            businessHours: addr.businessHours ?? null,
            isDefault: addr.isDefault ?? false,
          })),
        },
      },
      include: {
        addresses: true,
        transport: true,
      },
    });
  }

  async findAll() {
    return this.prisma.customer.findMany({
      include: {
        addresses: true,
        transport: true,
      },
      orderBy: { name: 'asc' },
    });
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
      throw new NotFoundException(
        `El cliente con ID "${id}" no fue encontrado.`,
      );
    }

    return customer;
  }
}
