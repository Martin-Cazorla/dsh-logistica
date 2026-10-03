import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { TransferStockDto } from './dto/transfer-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('transfer')
  async transferStock(@Body() dto: TransferStockDto) {
    return await this.inventoryService.transferStock(dto);
  }

  @Get('warehouse/:id')
  async getByWarehouse(@Param('id') warehouseId: string) {
    return await this.inventoryService.getInventoryByWarehouse(warehouseId);
  }
}
