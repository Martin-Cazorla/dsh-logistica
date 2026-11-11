// frontend/src/app/dashboard/layout.tsx

import React from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

/**
 * /dashboard/* es el área de gestión (Administrador y Gestor). Cada página
 * aplica además su permiso específico (p. ej. Usuarios sólo ADMIN).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER']}>
      <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
        <Header />
        <div className="flex flex-1 flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
