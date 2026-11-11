// dsh-logistica/src/orders/controllers/order-checking.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { Permission } from '../../auth/permissions';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { OrderCheckingService } from '../services/order-checking.service';
import { ConfirmCheckingDto } from '../dto/checking-order.dto';

/** Punto de Control 1 (auditoría en playa, opcional). */
@Controller('orders/check')
@RequirePermissions(Permission.CHECKING_EXECUTE)
export class OrderCheckingController {
  constructor(private readonly orderCheckingService: OrderCheckingService) {}

  @Get('pending')
  getPickedOrders() {
    return this.orderCheckingService.getPickedOrders();
  }

  @Get(':id')
  getOrderForChecking(@Param('id', new ParseUUIDPipe()) orderId: string) {
    return this.orderCheckingService.getOrderForChecking(orderId);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  verifyOrder(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser() auditor: AuthenticatedUser,
    @Body() dto: ConfirmCheckingDto,
  ) {
    return this.orderCheckingService.verifyOrderItems(orderId, auditor, dto);
  }
}
