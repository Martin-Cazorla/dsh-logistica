'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else {
        switch (user.role) {
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
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          Cargando sistema DSH Logística...
        </h2>
      </div>
    </div>
  );
}
