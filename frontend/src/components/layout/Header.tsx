'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-700 bg-slate-800 px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
          DSH Logística
        </h1>
        <span className="hidden rounded-full bg-blue-900/60 border border-blue-500/40 px-3 py-1 text-xs font-semibold text-blue-300 sm:inline-block">
          WMS / ERP
        </span>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="text-right">
            <p className="text-sm font-semibold text-white leading-none">
              {user.fullName}
            </p>
            <p className="text-xs text-slate-400 mt-1 uppercase font-mono">
              {user.role}
            </p>
          </div>
        )}

        <button
          onClick={logout}
          className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-red-600 hover:text-white transition-colors duration-200"
          title="Cerrar Sesión"
        >
          SALIR
        </button>
      </div>
    </header>
  );
}
