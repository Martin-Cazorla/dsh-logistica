// dsh-logistica/src/inventory/inventory.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryService } from './inventory.service';
import { OccupationService } from './services/occupation.service';
import { StockRequestsService } from './services/stock-requests.service';
import { InventoryController } from './inventory.controller';
import { OccupationController } from './controllers/occupation.controller';
import { InventoryGateway } from './inventory.gateway';

@Module({
  // AuthModule exporta JwtModule: el gateway verifica el token del handshake.
  imports: [PrismaModule, AuthModule],
  controllers: [InventoryController, OccupationController],
  providers: [
    InventoryService,
    OccupationService,
    StockRequestsService,
    InventoryGateway,
  ],
  exports: [InventoryService, OccupationService, InventoryGateway],
})
export class InventoryModule {}
