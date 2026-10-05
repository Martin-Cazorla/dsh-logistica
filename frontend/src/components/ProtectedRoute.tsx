'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/auth.types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else if (allowedRoles && !allowedRoles.includes(user.role)) {
        redirectByRole(user.role);
      }
    }
  }, [user, isLoading, router, allowedRoles]);

  const redirectByRole = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
      case 'WAREHOUSE_MANAGER':
        router.push('/dashboard');
        break;
      case 'PICKER':
        router.push('/picking');
        break;
      case 'DRIVER':
        router.push('/routes');
        break;
      default:
        router.push('/login');
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <svg
            className="animate-spin h-6 w-6 text-blue-500"
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
