// dsh-logistica/src/analytics/analytics.controller.ts

import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import {
  SalesByZoneQueryDto,
  TopZonesQueryDto,
} from './dto/sales-by-zone-query.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * Análisis comercial (Administrador y Gestor). Los importes sólo se incluyen
 * si canViewMoney(rol): módulo de ventas activo + permiso SALES_VIEW.
 */
@Controller('analytics')
@RequirePermissions(Permission.ANALYTICS_VIEW)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Drill-down: provincia → zona → localidad. */
  @Get('sales-by-zone')
  salesByZone(
    @Query() query: SalesByZoneQueryDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.analytics.salesByZone(query, user.role);
  }

  /** Top de zonas del último período (tarjeta del Dashboard). */
  @Get('top-zones')
  topZones(@Query() query: TopZonesQueryDto) {
    return this.analytics.topZones(query);
  }

  /** Opciones de filtros: depósitos, vendedores, estados y período por defecto. */
  @Get('filters')
  filters(@GetUser() user: AuthenticatedUser) {
    return this.analytics.filters(user.role);
  }
}
