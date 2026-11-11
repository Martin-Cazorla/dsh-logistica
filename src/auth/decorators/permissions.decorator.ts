// dsh-logistica/src/auth/decorators/permissions.decorator.ts

import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Exige que el rol del usuario tenga AL MENOS UNO de los permisos indicados.
 * El método puede sobrescribir lo declarado en la clase.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
