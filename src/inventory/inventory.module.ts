import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryService } from './inventory.service';
import { OccupationService } from './services/occupation.service';
import { InventoryController } from './inventory.controller';
import { OccupationController } from './controllers/occupation.controller';
import { InventoryGateway } from './inventory.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController, OccupationController],
  providers: [InventoryService, OccupationService, InventoryGateway],
  exports: [InventoryService, OccupationService],
})
export class InventoryModule {}
