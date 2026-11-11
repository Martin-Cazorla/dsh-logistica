// dsh-logistica/src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { GetUser } from './decorators/get-user.decorator';
import { Public } from './decorators/public.decorator';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Permite al frontend validar el token guardado y obtener el rol vigente
   * desde la base de datos (no desde localStorage).
   */
  @Get('profile')
  getProfile(@GetUser() user: AuthenticatedUser) {
    return user;
  }
}
