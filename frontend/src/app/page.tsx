// frontend/src/app/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { homePathForRole } from '@/lib/roles';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? homePathForRole(user.role) : '/login');
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
