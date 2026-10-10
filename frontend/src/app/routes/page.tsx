// frontend/src/app/routes/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { routesService } from '@/services/routes.service';
import { Driver, RoutePendingOrder, LogisticsZone } from '@/types/routes.types';

const ZONES: { key: LogisticsZone; label: string }[] = [
  { key: 'CABA', label: 'CABA' },
  { key: 'ZONA_NORTE', label: 'Zona Norte (GBA)' },
  { key: 'ZONA_SUR', label: 'Zona Sur (GBA)' },
  { key: 'ZONA_OESTE', label: 'Zona Oeste (GBA)' },
  { key: 'INTERIOR', label: 'Resto del País (Interior)' },
];

export default function RoutesPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [pendingOrders, setPendingOrders] = useState<RoutePendingOrder[]>([]);
  const [selectedZone, setSelectedZone] = useState<LogisticsZone>('CABA');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    initData();
  }, [selectedZone]);

  const initData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [driversData, ordersData] = await Promise.all([
        routesService.getDrivers(),
        routesService.getPendingOrdersForRoute(selectedZone),
      ]);
      setDrivers(driversData);
      setPendingOrders(ordersData);
      setSelectedOrderIds([]);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al cargar los datos de transporte y pedidos.',
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  // Cálculos acumulados de la carga seleccionada
  const selectedOrders = pendingOrders.filter((o) =>
    selectedOrderIds.includes(o.id),
  );
  const currentTotalWeightKg = selectedOrders.reduce(
    (sum, o) => sum + o.totalWeightKg,
    0,
  );
  const currentTotalBultos = selectedOrders.reduce(
    (sum, o) => sum + o.totalBultos,
    0,
  );
  const isOverweight = selectedDriver
    ? currentTotalWeightKg > selectedDriver.maxCapacityKg
    : false;

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId],
    );
  };

  const handleSelectAllOrders = () => {
    if (selectedOrderIds.length === pendingOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pendingOrders.map((o) => o.id));
    }
  };

  const handleCreateRoute = async () => {
    if (!selectedDriverId) {
      setErrorMsg('Debe seleccionar un chofer o unidad de transporte.');
      return;
    }
    if (selectedOrderIds.length === 0) {
      setErrorMsg(
        'Debe seleccionar al menos un pedido para consolidar la hoja de ruta.',
      );
      return;
    }
    if (isOverweight) {
      setErrorMsg(
        'La carga seleccionada supera el límite máximo en Kg permitido para el vehículo.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      driverId: selectedDriverId,
      zone: selectedZone,
      orderIds: selectedOrderIds,
      notes: notes.trim() || undefined,
    };

    try {
      await routesService.createRoute(payload);
      setSuccessMsg(
        `Hoja de Ruta emitida con éxito. ${selectedOrderIds.length} pedidos pasados a DESPACHADO.`,
      );
      setSelectedDriverId('');
      setSelectedOrderIds([]);
      setNotes('');
      await initData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al emitir la Hoja de Ruta.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER', 'DRIVER']}>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 font-sans">
        {/* Encabezado Principal */}
        <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-emerald-400 tracking-wide">
              Hojas de Ruta & Consolidación Logística
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Agrupación por zonificación de envíos y control estricto de
              tonelaje
            </p>
          </div>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="bg-red-900/80 border border-red-500 text-red-200 p-4 rounded-xl mb-6 text-sm font-semibold">
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-900/80 border border-emerald-500 text-emerald-200 p-4 rounded-xl mb-6 text-sm font-semibold">
            ✅ {successMsg}
          </div>
        )}

        {/* Pestañas de Selección de Zona Logística */}
        <div className="flex overflow-x-auto gap-2 mb-6 pb-2 border-b border-slate-800">
          {ZONES.map((zone) => (
            <button
              key={zone.key}
              onClick={() => setSelectedZone(zone.key)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all border ${
                selectedZone === zone.key
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              {zone.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-400"></div>
            <p className="mt-4 text-slate-400 font-medium text-sm">
              Cargando pedidos auditados y vehículos...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* COLUMNA 1 y 2: Lista de Pedidos Auditados (CHECKED) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border border-slate-700">
                <span className="text-sm font-bold text-slate-200">
                  Pedidos Auditados en {selectedZone}: ({pendingOrders.length})
                </span>
                {pendingOrders.length > 0 && (
                  <button
                    onClick={handleSelectAllOrders}
                    className="text-xs text-emerald-400 font-bold hover:underline"
                  >
                    {selectedOrderIds.length === pendingOrders.length
                      ? 'Desmarcar Todos'
                      : 'Seleccionar Todos'}
                  </button>
                )}
              </div>

              {pendingOrders.length === 0 ? (
                <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400">
                  No hay pedidos auditados (CHECKED) listos para despachar en
                  esta zona.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingOrders.map((order) => {
                    const isSelected = selectedOrderIds.includes(order.id);

                    return (
                      <div
                        key={order.id}
                        onClick={() => toggleOrderSelection(order.id)}
                        className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-950/20 border-emerald-500 shadow-md'
                            : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Manejado por div onClick
                            className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                          />
                          <div>
                            <span className="text-sm font-bold text-amber-400">
                              #{order.orderNumber}
                            </span>
                            <p className="text-sm font-semibold text-slate-100">
                              {order.customerName}
                            </p>
                            <p className="text-xs text-slate-400">
                              Dirección: {order.deliveryAddress}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">
                            {order.totalBultos} Bultos
                          </span>
                          <span className="text-sm font-extrabold text-slate-200">
                            {order.totalWeightKg} Kg
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COLUMNA 3: Asignación de Chofer y Panel de Balanza Logística */}
            <div className="space-y-4">
              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl space-y-4 shadow-xl">
                <h3 className="text-base font-bold text-emerald-400 border-b border-slate-700 pb-2">
                  Configuración de la Hoja de Ruta
                </h3>

                {/* Seleccionar Chofer */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Chofer / Transporte Asignado
                  </label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Seleccionar Chofer --</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.vehicleModel} - {d.vehiclePlate})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Balanza de Capacidad y Carga en Kg */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      Pedidos Seleccionados:
                    </span>
                    <span className="font-bold text-white">
                      {selectedOrders.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Bultos Totales:</span>
                    <span className="font-bold text-white">
                      {currentTotalBultos}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      Capacidad Máx. Vehículo:
                    </span>
                    <span className="font-bold text-white">
                      {selectedDriver
                        ? `${selectedDriver.maxCapacityKg} Kg`
                        : 'N/A'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-300">
                      Peso Acumulado:
                    </span>
                    <span
                      className={`text-lg font-black ${
                        isOverweight ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {currentTotalWeightKg} Kg
                    </span>
                  </div>

                  {/* Barra de Progreso de Tonelaje */}
                  {selectedDriver && (
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          isOverweight ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (currentTotalWeightKg /
                              selectedDriver.maxCapacityKg) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}

                  {isOverweight && (
                    <p className="text-xs text-red-400 font-bold mt-1">
                      ⚠️ Carga excedida por{' '}
                      {currentTotalWeightKg -
                        (selectedDriver?.maxCapacityKg || 0)}{' '}
                      Kg.
                    </p>
                  )}
                </div>

                {/* Observaciones opcionales */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Notas para el Chofer
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Entregar antes del mediodía..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 h-20 resize-none"
                  />
                </div>

                {/* Botón de Emisión */}
                <button
                  type="button"
                  onClick={handleCreateRoute}
                  disabled={
                    submitting || isOverweight || selectedOrderIds.length === 0
                  }
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg active:scale-[0.98]"
                >
                  {submitting
                    ? 'Emitiendo Hoja de Ruta...'
                    : '🚚 EMITIR HOJA DE RUTA'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
