// dsh-logistica/src/auth/guards/roles.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission, hasAnyPermission } from '../permissions';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Guard global de autorización (registrado como APP_GUARD, después de
 * JwtAuthGuard).
 *
 * Política:
 * - Rutas @Public(): permitidas.
 * - @RequirePermissions(): el rol debe tener al menos uno de los permisos
 *   (matriz en src/auth/permissions.ts).
 * - @Roles(): compatibilidad con controladores existentes; el rol debe estar
 *   incluido.
 * - Si se declaran ambos, deben cumplirse ambos.
 * - Sin metadatos: cualquier usuario autenticado y activo.
 *
 * El rol proviene de la BD (JwtStrategy), nunca del payload del token.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Sesión no válida o expirada.');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Acceso denegado: usuario inactivo.');
    }

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      targets,
    );

    if (
      requiredPermissions &&
      requiredPermissions.length > 0 &&
      !hasAnyPermission(user.role, requiredPermissions)
    ) {
      throw new ForbiddenException(
        'Acceso denegado: Tu rol actual no tiene permisos para realizar esta acción.',
      );
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );

    if (
      requiredRoles &&
      requiredRoles.length > 0 &&
      !requiredRoles.includes(user.role)
    ) {
      throw new ForbiddenException(
        'Acceso denegado: Tu rol actual no tiene permisos para realizar esta acción.',
      );
    }

    return true;
  }
}
