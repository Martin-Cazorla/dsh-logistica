// dsh-logistica/src/transports/transports.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TransportsService } from './transports.service';
import { CreateTransportDto } from './dto/create-transport.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('transports')
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)
export class TransportsController {
  constructor(private readonly transportsService: TransportsService) {}

  @Post()
  async create(@Body() createTransportDto: CreateTransportDto) {
    return this.transportsService.create(createTransportDto);
  }

  @Get()
  async findAll() {
    return this.transportsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.transportsService.findOne(id);
  }
}
