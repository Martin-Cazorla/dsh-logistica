// dsh-logistica/src/auth/guards/jwt-auth.guard.ts

import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global de autenticación (registrado como APP_GUARD).
 * - Deny-by-default: toda ruta HTTP exige JWT salvo las marcadas con @Public().
 * - Los gateways WebSocket autentican en su propio middleware de handshake,
 *   por lo que este guard sólo actúa sobre contexto HTTP.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
