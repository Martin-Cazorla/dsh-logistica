import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { OccupationService } from '../services/occupation.service';
import { WarehouseOccupationDto } from '../dto/occupation-response.dto';

@Controller('inventory/occupation')
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
