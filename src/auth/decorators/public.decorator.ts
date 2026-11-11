// dsh-logistica/src/auth/decorators/public.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un handler o controlador como accesible sin JWT.
 * Por defecto TODAS las rutas requieren autenticación (guard global).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
