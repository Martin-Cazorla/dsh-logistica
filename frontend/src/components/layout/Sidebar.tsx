// frontend/src/components/layout/Sidebar.tsx

'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { canAny, ROLE_LABELS } from '@/lib/permissions';
import { NAV_ITEMS, NavItem } from '@/lib/nav';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Agrupación memoizada: sólo cambia si cambia el rol
  const groups = useMemo(() => {
    const visible = NAV_ITEMS.filter((item) =>
      canAny(user?.role, item.permissions),
    );
    const map = new Map<NavItem['group'], NavItem[]>();
    for (const item of visible) {
      map.set(item.group, [...(map.get(item.group) ?? []), item]);
    }
    return [...map.entries()];
  }, [user?.role]);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-800 bg-slate-900 p-4 text-slate-200 md:flex">
      <div>
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-lg font-black text-slate-950">
            D
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-wide text-white">
              DSH Logística
            </h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              WMS / ERP
            </span>
          </div>
        </div>

        <nav className="space-y-5">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {group}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                      isActive(item.href)
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-slate-800 px-2 pt-4 text-[11px] text-slate-500">
        <strong className="block text-slate-300">{user?.email}</strong>
        {user && ROLE_LABELS[user.role]}
      </div>
    </aside>
  );
}
