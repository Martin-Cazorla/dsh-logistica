import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const existingCustomer = await this.prisma.customer.findFirst({
      where: { code: createCustomerDto.code },
    });

    if (existingCustomer) {
      throw new ConflictException(
        `Ya existe un cliente registrado con el código "${createCustomerDto.code}".`,
      );
    }

    return this.prisma.customer.create({
      data: {
        code: createCustomerDto.code,
        name: createCustomerDto.name,
        address: createCustomerDto.address,
        zone: createCustomerDto.zone,
        taxId: createCustomerDto.taxId ?? '',
        email: createCustomerDto.email ?? '',
        phone: createCustomerDto.phone ?? '',
        city: createCustomerDto.city ?? '',
      },
    });
  }

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
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
