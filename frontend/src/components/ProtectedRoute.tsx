// frontend/src/components/ProtectedRoute.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/auth.types';
import { homePathForRole } from '@/lib/roles';
import { canAny, Permission } from '@/lib/permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles permitidos (compatibilidad). */
  allowedRoles?: UserRole[];
  /** Al menos uno de estos permisos (preferido; espejo de la matriz del backend). */
  requiredPermissions?: Permission[];
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requiredPermissions,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const rolesKey = allowedRoles?.join(',') ?? '';
  const permsKey = requiredPermissions?.join(',') ?? '';

  const isAllowed =
    !!user &&
    (!allowedRoles || allowedRoles.includes(user.role)) &&
    (!requiredPermissions ||
      requiredPermissions.length === 0 ||
      canAny(user.role, requiredPermissions));

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
    } else if (!isAllowed) {
      router.replace(homePathForRole(user.role));
    }
  }, [user, isLoading, isAllowed, rolesKey, permsKey, router]);

  if (isLoading || !user || !isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <svg
            className="h-6 w-6 animate-spin text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            ></path>
          </svg>
          <span className="text-base font-medium">Validando sesión...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
