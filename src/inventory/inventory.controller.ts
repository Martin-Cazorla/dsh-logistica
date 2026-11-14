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
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockRequestsService } from './services/stock-requests.service';
import { StockAvailabilityService } from './services/stock-availability.service';
import { InboundDto, CreateWarehouseDto } from './dto/inbound.dto';
import { CreateManualStockDto } from './dto/create-manual-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ProcessInboundDto } from './dto/process-inbound.dto';
import { GenerateBatchLocationsDto } from './dto/generate-batch-locations.dto';
import {
  UpdateLocationsCapacityDto,
  DeleteLocationsBatchDto,
} from './dto/update-locations-capacity.dto';
import {
  CreateStockRequestDto,
  ListStockRequestsQueryDto,
  ReviewStockRequestDto,
} from './dto/stock-request.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * Permisos (src/auth/permissions.ts):
 *  - INVENTORY_VIEW      : consultar ocupación, ubicaciones y stock.
 *  - INVENTORY_RELOCATE  : reubicación física de pallets (incluye PICKER).
 *  - INVENTORY_COUNT     : registrar conteos / solicitar descuentos (PICKER):
 *                          NO modifica stock hasta su aprobación.
 *  - INVENTORY_MODIFY    : ajustes directos, carga manual, ingreso de
 *                          contenedores y aprobación de solicitudes.
 *  - WAREHOUSE_CONFIG    : depósitos y ubicaciones.
 */
@Controller('inventory')
@RequirePermissions(Permission.INVENTORY_MODIFY)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly stockRequestsService: StockRequestsService,
    private readonly stockAvailabilityService: StockAvailabilityService,
  ) {}

  /**
   * Consulta de stock DISPONIBLE por depósito (sin ubicaciones). Pantalla del
   * Vendedor; sólo lectura.
   */
  @Get('availability')
  @RequirePermissions(
    Permission.STOCK_AVAILABILITY_VIEW,
    Permission.INVENTORY_VIEW,
  )
  getAvailability(
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(40), ParseIntPipe) limit?: number,
  ) {
    return this.stockAvailabilityService.search({ search, limit });
  }

  // ---------------------------------------------------------------------------
  // OCUPACIÓN Y DEPÓSITOS
  // ---------------------------------------------------------------------------

  @Get('occupancy')
  @RequirePermissions(Permission.INVENTORY_VIEW, Permission.DASHBOARD_VIEW)
  getOccupancy() {
    return this.inventoryService.getOccupancySummary();
  }

  @Get('warehouses')
  @RequirePermissions(
    Permission.INVENTORY_VIEW,
    Permission.STOCK_AVAILABILITY_VIEW,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_MANAGE,
    Permission.DASHBOARD_VIEW,
  )
  getWarehouses() {
    return this.inventoryService.getWarehousesList();
  }

  @Post('warehouse')
  @RequirePermissions(Permission.WAREHOUSE_CONFIG)
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Delete('warehouse/:id')
  @RequirePermissions(Permission.USERS_MANAGE)
  deleteWarehouse(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventoryService.deleteWarehouse(id);
  }

  // ---------------------------------------------------------------------------
  // UBICACIONES
  // ---------------------------------------------------------------------------

  @Get('locations/:warehouseId')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  getLocations(@Param('warehouseId', new ParseUUIDPipe()) warehouseId: string) {
    return this.inventoryService.getLocationsByWarehouse(warehouseId);
  }

  @Post('locations/batch')
  @RequirePermissions(Permission.WAREHOUSE_CONFIG)
  generateBatchLocations(@Body() dto: GenerateBatchLocationsDto) {
    return this.inventoryService.generateLocationsBatch(dto);
  }

  @Put('locations/capacity')
  @RequirePermissions(Permission.WAREHOUSE_CONFIG)
  updateLocationsCapacity(@Body() dto: UpdateLocationsCapacityDto) {
    return this.inventoryService.updateLocationsCapacity(dto.updates);
  }

  @Delete('locations/batch')
  @RequirePermissions(Permission.WAREHOUSE_CONFIG)
  deleteBatchLocations(@Body() dto: DeleteLocationsBatchDto) {
    return this.inventoryService.deleteLocationsBatch(dto.locationIds);
  }

  // ---------------------------------------------------------------------------
  // STOCK
  // ---------------------------------------------------------------------------

  @Get('stock')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  getStock(
    @Query('warehouseId', new ParseUUIDPipe({ optional: true }))
    warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getStockList(warehouseId, search);
  }

  @Get('location-stock/:locationId')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  getStockByLocation(
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
  ) {
    return this.inventoryService.getStockByLocation(locationId);
  }

  /** Reubicación física de pallets: permitido al PICKER. */
  @Post('stock/transfer')
  @RequirePermissions(Permission.INVENTORY_RELOCATE)
  transferStock(
    @Body() dto: TransferStockDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.transferStock(dto, user);
  }

  /** Ajuste directo: sólo Gestor / Administrador. */
  @Post('stock/adjust')
  adjustStock(@Body() dto: AdjustStockDto, @GetUser() user: AuthenticatedUser) {
    return this.inventoryService.adjustStock(dto, user);
  }

  @Get('stock/adjustments')
  @RequirePermissions(Permission.INVENTORY_MODIFY, Permission.AUDIT_VIEW)
  getAdjustmentHistory(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.inventoryService.getAdjustmentHistory(limit);
  }

  @Post('manual-stock')
  createManualStock(
    @Body() dto: CreateManualStockDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createManualStock(dto, user);
  }

  // ---------------------------------------------------------------------------
  // CONTEOS Y SOLICITUDES CON APROBACIÓN
  // ---------------------------------------------------------------------------

  @Post('stock-requests')
  @RequirePermissions(Permission.INVENTORY_COUNT)
  createStockRequest(
    @Body() dto: CreateStockRequestDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.stockRequestsService.create(dto, user);
  }

  @Get('stock-requests')
  @RequirePermissions(Permission.INVENTORY_COUNT, Permission.INVENTORY_MODIFY)
  listStockRequests(
    @Query() query: ListStockRequestsQueryDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.stockRequestsService.list(query, user);
  }

  @Post('stock-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveStockRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewStockRequestDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.stockRequestsService.approve(id, dto, user);
  }

  @Post('stock-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectStockRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewStockRequestDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.stockRequestsService.reject(id, dto, user);
  }

  // ---------------------------------------------------------------------------
  // PACKING LIST Y CONTENEDORES
  // ---------------------------------------------------------------------------

  @Post('inbound/packing-list')
  createPackingList(@Body() dto: InboundDto) {
    return this.inventoryService.createPackingList(dto);
  }

  @Get('inbound/containers')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  getContainersHistory(@Query('status') status?: string) {
    return this.inventoryService.getContainersHistory(status);
  }

  @Delete('inbound/container/:id')
  deleteContainer(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventoryService.deleteContainer(id);
  }

  @Post('inbound/process')
  processInbound(
    @Body() dto: ProcessInboundDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.processInbound(dto, user);
  }
}
