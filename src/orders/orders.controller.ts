// dsh-logistica/src/orders/orders.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
} from './dto/create-order.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { isSalesModuleEnabled } from '../common/sales';

@Controller('orders')
@RequirePermissions(Permission.ORDERS_MANAGE)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Indica al frontend si debe mostrar los campos monetarios. */
  @Get('config')
  @RequirePermissions(Permission.ORDERS_VIEW)
  getConfig() {
    return { salesModuleEnabled: isSalesModuleEnabled() };
  }

  /** Alta: Administrador, Gestor y Vendedor (este último sólo a su nombre). */
  @Post()
  @RequirePermissions(Permission.ORDERS_CREATE)
  create(@Body() dto: CreateOrderDto, @GetUser() user: AuthenticatedUser) {
    return this.ordersService.create(dto, user);
  }

  @Get()
  @RequirePermissions(Permission.ORDERS_VIEW)
  findAll(
    @Query() query: ListOrdersQueryDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions(Permission.ORDERS_VIEW)
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.cancel(id, dto, user);
  }
}
