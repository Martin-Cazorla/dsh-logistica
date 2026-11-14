import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesZonesService } from './sales-zones.service';
import { SalesZonesController } from './sales-zones.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SalesZonesController],
  providers: [SalesZonesService],
  exports: [SalesZonesService],
})
export class SalesZonesModule {}
