import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransportDto } from './dto/create-transport.dto';

@Injectable()
export class TransportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTransportDto: CreateTransportDto) {
    return this.prisma.transport.create({
      data: {
        name: createTransportDto.name,
        address: createTransportDto.address,
        phone: createTransportDto.phone ?? null,
        businessHours: createTransportDto.businessHours ?? null,
      },
    });
  }

  async findAll() {
    return this.prisma.transport.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const transport = await this.prisma.transport.findUnique({
      where: { id },
      include: {
        customers: true,
        orders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!transport) {
      throw new NotFoundException(
        `El transporte con ID "${id}" no fue encontrado.`,
      );
    }

    return transport;
  }
}
