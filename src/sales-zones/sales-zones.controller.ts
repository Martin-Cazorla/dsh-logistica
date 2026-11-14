// dsh-logistica/src/sales-zones/sales-zones.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { SalesZonesService } from './sales-zones.service';
import { AssignLocalityDto } from './dto/assign-locality.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/** Administración de zonas comerciales (Administrador y Gestor). */
@Controller('sales-zones')
@RequirePermissions(Permission.CUSTOMERS_MANAGE)
export class SalesZonesController {
  constructor(private readonly zones: SalesZonesService) {}

  @Get()
  findAll() {
    return this.zones.findAll();
  }

  /** Combinaciones provincia/localidad de direcciones activas sin zona. */
  @Get('unassigned')
  unassigned() {
    return this.zones.unassigned();
  }

  @Put('localities')
  assign(@Body() dto: AssignLocalityDto, @GetUser() user: AuthenticatedUser) {
    return this.zones.assignLocality(dto, user);
  }

  @Delete('localities/:id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.zones.removeLocality(id, user);
  }
}
