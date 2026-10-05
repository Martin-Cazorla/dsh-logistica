import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersService } from './orders.service';
import { PickingService } from './services/picking.service';
import { OrderCheckingService } from './services/order-checking.service';
import { OrdersController } from './orders.controller';
import { PickingController } from './controllers/picking.controller';
import { OrderCheckingController } from './controllers/order-checking.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController, PickingController, OrderCheckingController],
  providers: [OrdersService, PickingService, OrderCheckingService],
  exports: [OrdersService, PickingService, OrderCheckingService],
})
export class OrdersModule {}
