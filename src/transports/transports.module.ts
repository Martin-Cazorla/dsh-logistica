import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportsService } from './transports.service';
import { TransportsController } from './transports.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TransportsController],
  providers: [TransportsService],
  exports: [TransportsService],
})
export class TransportsModule {}
