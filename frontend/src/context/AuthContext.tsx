// frontend/src/context/AuthContext.tsx

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { User, LoginCredentials, UserRole } from '@/types/auth.types';
import { authService } from '@/services/auth.service';
import {
  AUTH_LOGOUT_EVENT,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  clearStoredSession,
  getStoredToken,
} from '@/lib/axios';
import { homePathForRole } from '@/lib/roles';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Lee `exp` del JWT (sin verificar firma: eso lo hace el backend). */
function getTokenExpiryMs(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function normalizeUser(raw: Partial<User>): User {
  const firstName = raw.firstName ?? '';
  const lastName = raw.lastName ?? '';
  return {
    id: raw.id ?? '',
    email: raw.email ?? '',
    firstName,
    lastName,
    fullName: raw.fullName || `${firstName} ${lastName}`.trim(),
    role: (raw.role ?? 'PICKER') as UserRole,
  };
}

/**
 * Cambios clave:
 *  - Al montar, el token guardado se valida contra GET /auth/profile y el rol
 *    se toma del backend. Antes se confiaba en `localStorage.user`, editable
 *    desde DevTools (p. ej. cambiar role a ADMIN para ver pantallas).
 *    Nota: la autorización real la hace el backend; esto evita UI incoherente.
 *  - Logout automático al expirar el JWT y al recibir 401 (evento de Axios).
 *  - Sincronización de sesión entre pestañas (evento `storage`).
 *  - value memoizado + callbacks estables: antes cada render del Provider
 *    creaba un objeto nuevo y re-renderizaba TODOS los consumidores.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiryTimer = () => {
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  };

  const resetSession = useCallback(() => {
    clearExpiryTimer();
    clearStoredSession();
    setUser(null);
    setToken(null);
  }, []);

  const logout = useCallback(() => {
    resetSession();
    router.replace('/login');
  }, [resetSession, router]);

  const scheduleExpiry = useCallback(
    (jwt: string) => {
      clearExpiryTimer();
      const expiresAt = getTokenExpiryMs(jwt);
      if (!expiresAt) return;
      const delay = expiresAt - Date.now();
      if (delay <= 0) {
        logout();
        return;
      }
      // setTimeout admite como máximo ~24.8 días
      expiryTimer.current = setTimeout(logout, Math.min(delay, 2 ** 31 - 1));
    },
    [logout],
  );

  // Restaurar y validar sesión al montar
  useEffect(() => {
    let cancelled = false;
    const storedToken = getStoredToken();

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    const expiresAt = getTokenExpiryMs(storedToken);
    if (expiresAt && expiresAt <= Date.now()) {
      resetSession();
      setIsLoading(false);
      return;
    }

    authService
      .getProfile()
      .then((profile) => {
        if (cancelled) return;
        const freshUser = normalizeUser(profile);
        setToken(storedToken);
        setUser(freshUser);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser));
        } catch {
          // ignorar
        }
        scheduleExpiry(storedToken);
      })
      .catch(() => {
        if (!cancelled) resetSession();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resetSession, scheduleExpiry]);

  // 401 desde cualquier llamada Axios + logout/login en otra pestaña
  useEffect(() => {
    const onForcedLogout = () => logout();
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY && !event.newValue) {
        resetSession();
        router.replace('/login');
      }
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onForcedLogout);
      window.removeEventListener('storage', onStorage);
      clearExpiryTimer();
    };
  }, [logout, resetSession, router]);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      setIsLoading(true);
      try {
        const data = await authService.login(credentials);
        const loggedUser = normalizeUser(data.user);

        localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(loggedUser));

        setToken(data.accessToken);
        setUser(loggedUser);
        scheduleExpiry(data.accessToken);

        router.replace(homePathForRole(loggedUser.role));
      } finally {
        setIsLoading(false);
      }
    },
    [router, scheduleExpiry],
  );

  const hasRole = useCallback(
    (roles: UserRole[]): boolean => !!user && roles.includes(user.role),
    [user],
  );

  const value = useMemo<AuthContextType>(
    () => ({ user, token, isLoading, login, logout, hasRole }),
    [user, token, isLoading, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
