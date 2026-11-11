// dsh-logistica/src/auth/auth.constants.ts

/**
 * Obtiene el secreto JWT desde el entorno. No existe valor por defecto:
 * un secreto hardcodeado en el repositorio permite a cualquiera con acceso
 * al código firmar tokens válidos con rol ADMIN.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET no está definido o tiene menos de 32 caracteres. ' +
        'Defínalo en el archivo .env antes de iniciar el backend.',
    );
  }
  return secret;
}

export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
