'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Panel de Control Operativo
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Bienvenido,{' '}
          <span className="font-semibold text-slate-200">{user?.fullName}</span>
          . Estado general de almacenes y expedición.
        </p>
      </div>

      {/* Métricas Principales (KPIs) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Capacidad Depósito
          </p>
          <p className="mt-2 text-3xl font-extrabold text-blue-400">78%</p>
          <p className="mt-1 text-xs text-slate-400">
            Ocupación sobre posiciones físicas
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Pedidos PENDIENTES
          </p>
          <p className="mt-2 text-3xl font-extrabold text-amber-400">14</p>
          <p className="mt-1 text-xs text-slate-400">
            En cola para asignación de Picking
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Auditoría Playa (CHECKED)
          </p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-400">8</p>
          <p className="mt-1 text-xs text-slate-400">
            Listos para consolidar en Ruta
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Carga Despachada (Kg)
          </p>
          <p className="mt-2 text-3xl font-extrabold text-purple-400">
            4,250 kg
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Peso en rutas activas hoy
          </p>
        </div>
      </div>

      {/* Accesos Rápidos Operativos */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-lg">
        <h3 className="text-lg font-bold text-white mb-4">
          Módulos Críticos de Operación
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a
            href="/picking"
            className="flex flex-col p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
          >
            <span className="font-bold text-white">Picking de Pedidos</span>
            <span className="text-xs text-slate-400 mt-1">
              Armado multiusuario por bultos cerrados
            </span>
          </a>

          <a
            href="/checking"
            className="flex flex-col p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
          >
            <span className="font-bold text-white">Punto de Control 1</span>
            <span className="text-xs text-slate-400 mt-1">
              Auditoría en playa PICKED → CHECKED
            </span>
          </a>

          <a
            href="/routes"
            className="flex flex-col p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
          >
            <span className="font-bold text-white">Hojas de Ruta</span>
            <span className="text-xs text-slate-400 mt-1">
              Consolidación de carga y choferes
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
