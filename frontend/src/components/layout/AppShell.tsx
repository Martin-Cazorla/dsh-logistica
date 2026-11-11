// frontend/src/components/layout/AppShell.tsx

'use client';

import React from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Permission } from '@/lib/permissions';

/**
 * Marco común (cabecera + navegación por permisos) para las pantallas
 * operativas que viven fuera de /dashboard (picking, stock, rutas, control).
 */
export default function AppShell({
  children,
  permissions,
}: {
  children: React.ReactNode;
  permissions: Permission[];
}) {
  return (
    <ProtectedRoute requiredPermissions={permissions}>
      <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 p-3 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
