// dsh-logistica/src/common/cors.ts

/**
 * Orígenes permitidos para HTTP y WebSocket. Se evalúa en cada llamada (no al
 * importar) para respetar el .env cargado en el bootstrap.
 */
export function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Peticiones sin Origin (curl, server-to-server) no son navegadores: CORS no aplica.
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}
