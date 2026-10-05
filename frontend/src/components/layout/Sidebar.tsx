'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  roles: string[];
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
  },
  {
    label: 'Inventario / Ubicaciones',
    href: '/inventory',
    roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
  },
  {
    label: 'Pedidos / Ventas',
    href: '/orders',
    roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
  },
  {
    label: 'Modulo Picking',
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
    href: '/customers',
    roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
  },
  {
    label: 'Transportes',
    href: '/transports',
    roles: ['ADMIN', 'WAREHOUSE_MANAGER'],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  const filteredItems = navItems.filter((item) =>
    item.roles.includes(user.role),
  );

  return (
    <aside className="w-full md:w-64 bg-slate-800 border-r border-slate-700 flex-shrink-0">
      <nav className="p-4 space-y-1">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
