// frontend/src/lib/axios.ts

import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * URL base de la API (incluye el prefijo /api). Antes el fallback apuntaba a
 * :3000 (el propio Next.js) y inventory.service.ts creaba un segundo cliente
 * Axios SIN token, por lo que esas llamadas nunca iban autenticadas.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Origen del backend para Socket.IO. Si se pasa la URL con "/api", socket.io
 * la interpreta como el namespace "/api" (inexistente) y la conexión falla.
 */
export const SOCKET_URL = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return 'http://localhost:3001';
  }
})();

export const TOKEN_STORAGE_KEY = 'token';
export const USER_STORAGE_KEY = 'user';
export const AUTH_LOGOUT_EVENT = 'auth:logout';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // almacenamiento no disponible (modo privado / bloqueado)
  }
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      clearStoredSession();
      // AuthContext escucha este evento y hace logout vía router (sin recargar
      // la página completa ni perder el estado de React innecesariamente).
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    }
    return Promise.reject(error);
  },
);

/** Extrae un mensaje legible del error de NestJS (message puede ser string[]). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as AxiosError<{ message?: string | string[] }>;
  const message = err?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' · ');
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}

export default api;
