// dsh-logistica/src/users/users.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/user.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('users')
@RequirePermissions(Permission.USERS_MANAGE)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Listado: lo usa el ADMIN para administrar y el GESTOR para asignar
   * pickers, choferes y peones (sólo lectura).
   */
  @Get()
  @RequirePermissions(Permission.USERS_VIEW)
  findAll(
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    if (role && !Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException(`Rol inválido: ${role}`);
    }
    return this.usersService.findAll({
      role: role as UserRole | undefined,
      isActive:
        isActive === undefined ? undefined : isActive === 'true' ? true : false,
      search,
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_VIEW)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @GetUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @GetUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
    @GetUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.setStatus(id, dto, actor);
  }

  @Patch(':id/password')
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
    @GetUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.resetPassword(id, dto, actor);
  }
}
