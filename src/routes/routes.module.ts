// dsh-logistica/src/routes/routes.module.ts

import { Module } from '@nestjs/common';
import { RoutesService } from './services/routes.service';
import { RoutesController } from './controllers/routes.controller';

@Module({
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
