// dsh-logistica/src/inventory/controllers/occupation.controller.ts

import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { OccupationService } from '../services/occupation.service';
import { WarehouseOccupationDto } from '../dto/occupation-response.dto';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('inventory/occupation')
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.PICKER)
export class OccupationController {
  constructor(private readonly occupationService: OccupationService) {}

  @Get()
  async getAllWarehousesOccupation(): Promise<WarehouseOccupationDto[]> {
    return this.occupationService.getAllWarehousesOccupation();
  }

  @Get(':warehouseId')
  async getWarehouseOccupation(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
  ): Promise<WarehouseOccupationDto> {
    return this.occupationService.getWarehouseOccupation(warehouseId);
  }
}
