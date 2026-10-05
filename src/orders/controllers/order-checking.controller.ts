import {
  Controller,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { OrderCheckingService } from '../services/order-checking.service';

@Controller('orders/check')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class OrderCheckingController {
  constructor(private readonly orderCheckingService: OrderCheckingService) {}

  @Post(':id/verify')
  @Roles(UserRole.WAREHOUSE_MANAGER, UserRole.ADMIN)
  async verifyOrder(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser('id') auditorId: string,
  ) {
    return this.orderCheckingService.verifyOrderItems(orderId, auditorId);
  }
}
