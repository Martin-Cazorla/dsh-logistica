// dsh-logistica/src/trucks/trucks.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TrucksService } from './trucks.service';
import { CreateTruckDto, UpdateTruckDto } from './dto/truck.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('trucks')
@RequirePermissions(Permission.FLEET_MANAGE)
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Get()
  @RequirePermissions(Permission.FLEET_MANAGE, Permission.ROUTES_MANAGE)
  findAll(@Query('active') active?: string) {
    return this.trucksService.findAll(active === 'true');
  }

  @Get(':id')
  @RequirePermissions(Permission.FLEET_MANAGE, Permission.ROUTES_MANAGE)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trucksService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTruckDto, @GetUser() user: AuthenticatedUser) {
    return this.trucksService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTruckDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.trucksService.update(id, dto, user);
  }
}
