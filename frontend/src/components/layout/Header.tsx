// frontend/src/components/layout/Header.tsx

'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { canAny, ROLE_LABELS } from '@/lib/permissions';
import { NAV_ITEMS } from '@/lib/nav';

/**
 * Cabecera común. En pantallas chicas incluye el menú de navegación (el
 * Sidebar se oculta en móvil), así operarios con colectoras o celulares
 * tienen acceso a sus módulos.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = useMemo(
    () => NAV_ITEMS.filter((i) => canAny(user?.role, i.permissions)),
    [user?.role],
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-800">
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-sm text-slate-200 md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            DSH Logística
          </h1>
          <span className="hidden rounded-full border border-blue-500/40 bg-blue-900/60 px-3 py-1 text-xs font-semibold text-blue-300 sm:inline-block">
            WMS / ERP
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="text-right">
              <p className="text-sm font-semibold leading-none text-white">
                {user.fullName}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          )}

          <button
            onClick={logout}
            className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-slate-200 transition-colors duration-200 hover:bg-red-600 hover:text-white"
            title="Cerrar sesión"
          >
            SALIR
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="grid gap-1 border-t border-slate-700 px-3 py-3 md:hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold ${
                pathname === item.href
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
