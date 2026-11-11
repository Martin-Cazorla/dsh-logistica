// dsh-logistica/src/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getJwtSecret } from '../auth.constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      algorithms: ['HS256'],
    });
  }

  /**
   * El rol se toma SIEMPRE de la base de datos: si un administrador degrada o
   * desactiva a un usuario, el cambio aplica en la siguiente petición sin
   * esperar a que expire el token.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Acceso denegado: Usuario no autorizado o inactivo.',
      );
    }

    return {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
    };
  }
}
