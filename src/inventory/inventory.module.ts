import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryService } from './services/inventory.service';
import { OccupationService } from './services/occupation.service';
import { InventoryController } from './controllers/inventory.controller';
import { OccupationController } from './controllers/occupation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController, OccupationController],
  providers: [InventoryService, OccupationService],
  exports: [InventoryService, OccupationService],
})
export class InventoryModule {}
