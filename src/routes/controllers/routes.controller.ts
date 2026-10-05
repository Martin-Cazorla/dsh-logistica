import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { RoutesService } from '../services/routes.service';
import { CreateRouteDto } from '../dto/create-route.dto';

@Controller('routes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)
  async createRoute(@Body() createRouteDto: CreateRouteDto) {
    return this.routesService.createRoute(createRouteDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)
  async findAll() {
    return this.routesService.findAll();
  }

  @Get('my-deliveries')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  async getMyDriverRoutes(@GetUser('id') driverId: string) {
    return this.routesService.findMyDriverRoutes(driverId);
  }
}
