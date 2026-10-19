// dsh-logistica/src/inventory/inventory.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InboundDto, CreateWarehouseDto } from './dto/inbound.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('occupancy')
  getOccupancy() {
    return this.inventoryService.getOccupancySummary();
  }

  @Get('warehouses')
  getWarehouses() {
    return this.inventoryService.getWarehousesList();
  }

  @Post('warehouse')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Delete('warehouse/:id')
  deleteWarehouse(@Param('id') id: string) {
    return this.inventoryService.deleteWarehouse(id);
  }

  @Get('locations/:warehouseId')
  getLocations(@Param('warehouseId') warehouseId: string) {
    return this.inventoryService.getLocationsByWarehouse(warehouseId);
  }

  @Post('locations/batch')
  generateBatchLocations(
    @Body()
    dto: {
      warehouseId: string;
      category: 'RACK' | 'PASILLO' | 'TECHO';
      areaName: string;
      levels: string[];
      positionStart: number;
      positionEnd: number;
      maxCapacityM3PerUnit: number | string;
    },
  ) {
    return this.inventoryService.generateLocationsBatch(dto);
  }

  @Put('locations/capacity')
  updateLocationsCapacity(
    @Body() dto: { updates: Array<{ id: string; capacity: number }> },
  ) {
    return this.inventoryService.updateLocationsCapacity(dto.updates);
  }

  @Delete('locations/batch')
  deleteBatchLocations(@Body('locationIds') locationIds: string[]) {
    return this.inventoryService.deleteLocationsBatch(locationIds);
  }

  @Get('stock')
  getStock(
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getStockList(warehouseId, search);
  }

  // REUBICACIÓN DE STOCK / TRANSFERENCIA DE PALLETS
  @Post('stock/transfer')
  transferStock(
    @Body()
    dto: {
      inventoryId: string;
      targetLocationId: string;
      targetWarehouseId?: string;
      quantityBultos: number;
      userId?: string;
    },
  ) {
    return this.inventoryService.transferStock(dto);
  }

  // PACKING LIST Y HISTORIAL DE CONTENEDORES
  @Post('inbound/packing-list')
  createPackingList(@Body() dto: InboundDto) {
    return this.inventoryService.createPackingList(dto);
  }

  @Get('inbound/containers')
  getContainersHistory(@Query('status') status?: string) {
    return this.inventoryService.getContainersHistory(status);
  }

  @Delete('inbound/container/:id')
  deleteContainer(@Param('id') id: string) {
    return this.inventoryService.deleteContainer(id);
  }

  @Post('inbound/process')
  processInbound(
    @Body() dto: { containerId: string; items: any[]; userId?: string },
  ) {
    return this.inventoryService.processInbound(dto);
  }
}
