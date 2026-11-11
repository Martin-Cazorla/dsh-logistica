// dsh-logistica/src/routes/controllers/routes.controller.ts

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RoutesService } from '../services/routes.service';
import {
  CancelRouteDto,
  CreateRouteDto,
  DeliveryCheckDto,
  ListRoutesQueryDto,
  LoadCheckDto,
  ReorderStopsDto,
} from '../dto/create-route.dto';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { Permission } from '../../auth/permissions';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

/**
 * Hojas de ruta: consolidación de carga (Gestor), Punto de Control 2
 * (carga + descarga), reordenamiento por el chofer, control de viajes.
 * El alcance por usuario (sólo SU vuelta) se valida en el servicio.
 */
@Controller('routes')
@RequirePermissions(Permission.ROUTES_MANAGE)
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // --- Planificación (Gestor / Admin) ---------------------------------------

  @Get('dispatchable-orders')
  getDispatchableOrders() {
    return this.routesService.getDispatchableOrders();
  }

  @Get('crew')
  getCrew() {
    return this.routesService.getCrew();
  }

  @Post()
  create(@Body() dto: CreateRouteDto, @GetUser() user: AuthenticatedUser) {
    return this.routesService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: ListRoutesQueryDto) {
    return this.routesService.findAll(query);
  }

  // --- Control de viajes ------------------------------------------------------

  @Get('history')
  history(@Query() query: ListRoutesQueryDto) {
    return this.routesService.history(query);
  }

  @Get('metrics')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  metrics() {
    return this.routesService.metrics();
  }

  // --- Tripulación (Chofer / Peón) ------------------------------------------

  @Get('my-routes')
  @RequirePermissions(Permission.ROUTES_VIEW_OWN, Permission.ROUTES_MANAGE)
  myRoutes(@GetUser() user: AuthenticatedUser) {
    return this.routesService.findMyRoutes(user);
  }

  @Get(':id')
  @RequirePermissions(Permission.ROUTES_VIEW_OWN, Permission.ROUTES_MANAGE)
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.findOne(id, user);
  }

  @Put(':id/sequence')
  @RequirePermissions(Permission.ROUTES_REORDER)
  reorder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderStopsDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.reorder(id, dto, user);
  }

  /** Punto de Control 2a: verificación de bultos al cargar el camión. */
  @Post(':id/stops/:stopId/load-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DISPATCH_CHECK)
  loadCheck(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('stopId', new ParseUUIDPipe()) stopId: string,
    @Body() dto: LoadCheckDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.loadCheck(id, stopId, dto, user);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DISPATCH_CHECK)
  start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.startRoute(id, user);
  }

  /** Punto de Control 2b: validación de descarga en el domicilio del cliente. */
  @Post(':id/stops/:stopId/delivery-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.DELIVERY_CHECK)
  deliveryCheck(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('stopId', new ParseUUIDPipe()) stopId: string,
    @Body() dto: DeliveryCheckDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.deliveryCheck(id, stopId, dto, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelRouteDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.routesService.cancel(id, dto, user);
  }
}
