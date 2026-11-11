// dsh-logistica/src/auth/auth.service.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

// Hash bcrypt de un valor aleatorio: se compara contra él cuando el email no
// existe para que el tiempo de respuesta no revele qué cuentas existen.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(randomUUID(), 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim();
    const { password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_BCRYPT_HASH,
    );

    // Mismo mensaje para "no existe", "inactivo" y "contraseña incorrecta":
    // evita la enumeración de cuentas.
    if (!user || !isPasswordValid || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        role: user.role,
      },
    };
  }
}
