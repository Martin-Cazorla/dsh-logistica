// frontend/src/components/layout/Sidebar.tsx

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const menuItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
    },
    {
      label: 'Inventario / Ubicaciones',
      href: '/dashboard/inventory',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER'],
    },
    {
      label: 'Pedidos / Ventas',
      href: '/dashboard/orders',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
    },
    {
      label: 'Módulo Picking',
      href: '/picking',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER'],
    },
    {
      label: 'Punto de Control',
      href: '/checking',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
    },
    {
      label: 'Hojas de Ruta',
      href: '/routes',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'DRIVER'],
    },
    {
      label: 'Clientes',
      href: '/dashboard/customers',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
    },
    {
      label: 'Transportes',
      href: '/dashboard/transports',
      roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 min-h-screen text-slate-200">
      <div>
        <div className="mb-8 px-2 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 font-black text-lg">
            D
          </div>
          <div>
            <h2 className="font-extrabold text-base tracking-wide text-white">
              DSH Logística
            </h2>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
              WMS / ERP
            </span>
          </div>
        </div>

        <nav className="space-y-1.5">
          {menuItems.map((item) => {
            if (user && !item.roles.includes(user.role)) return null;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-800 px-2 text-[11px] text-slate-500">
        Usuario: <strong className="text-slate-300 block">{user?.email}</strong>
      </div>
    </aside>
  );
}
