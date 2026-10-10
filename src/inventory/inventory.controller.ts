// src/inventory/inventory.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TransferStockDto } from './dto/transfer-stock.dto';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('occupancy')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async getOccupancy() {
    return this.inventoryService.getOccupancySummary();
  }

  @Get('warehouses')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async getWarehouses() {
    return this.inventoryService.getWarehousesList();
  }

  @Get('stock')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async getStock(
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getStockList(warehouseId, search);
  }

  @Get('locations/:warehouseId')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async getLocations(@Param('warehouseId') warehouseId: string) {
    return this.inventoryService.getLocationsByWarehouse(warehouseId);
  }

  @Post('inbound/receive')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER')
  async receiveContainer(@Body() body: any, @GetUser() user: any) {
    return this.inventoryService.processInbound(body, user?.id);
  }

  @Patch('stock/move')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async moveStock(@Body() body: any) {
    return this.inventoryService.moveStock(body);
  }

  @Post('transfer')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async transferStock(@Body() dto: TransferStockDto) {
    return await this.inventoryService.transferStock(dto);
  }

  @Get('warehouse/:id')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER', 'PICKER')
  async getByWarehouse(@Param('id') warehouseId: string) {
    return await this.inventoryService.getInventoryByWarehouse(warehouseId);
  }

  @Post('warehouses')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER')
  async createWarehouse(
    @Body() body: { name: string; code?: string; address?: string },
  ) {
    return this.inventoryService.createWarehouse(body);
  }

  @Delete('warehouses/:id')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER')
  async deleteWarehouse(@Param('id') id: string) {
    return this.inventoryService.deleteWarehouse(id);
  }

  @Post('locations/generate-batch')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER')
  async generateBatchLocations(@Body() body: any) {
    return this.inventoryService.generateLocationsBatch(body);
  }

  @Post('locations/delete-batch')
  @Roles('ADMIN', 'WAREHOUSE_MANAGER')
  async deleteLocationsBatch(@Body() body: { locationIds: string[] }) {
    return this.inventoryService.deleteLocationsBatch(body.locationIds);
  }

  @Post('clear-all')
  @Roles('ADMIN')
  async clearAllInventoryData() {
    return this.inventoryService.clearAllInventoryData();
  }
}
