// frontend/src/app/checking/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { checkingService } from '@/services/checking.service';
import { CheckingOrder } from '@/types/checking.types';

export default function CheckingPage() {
  const [orders, setOrders] = useState<CheckingOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CheckingOrder | null>(
    null,
  );
  const [checkedItemsState, setCheckedItemsState] = useState<
    Record<string, { qty: number; verified: boolean }>
  >({});
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadPickedOrders();
  }, []);

  const loadPickedOrders = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await checkingService.getPickedOrders();
      setOrders(data);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al obtener pedidos listos para auditoría.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (order: CheckingOrder) => {
    setSelectedOrder(order);
    const initialMap: Record<string, { qty: number; verified: boolean }> = {};
    order.items.forEach((item) => {
      initialMap[item.id] = {
        qty: item.quantityPicked,
        verified: false,
      };
    });
    setCheckedItemsState(initialMap);
    setNotes('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const toggleItemVerification = (itemId: string) => {
    setCheckedItemsState((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        verified: !prev[itemId]?.verified,
      },
    }));
  };

  const handleVerifyAll = () => {
    if (!selectedOrder) return;
    setCheckedItemsState((prev) => {
      const updated = { ...prev };
      selectedOrder.items.forEach((item) => {
        updated[item.id] = {
          qty: item.quantityPicked,
          verified: true,
        };
      });
      return updated;
    });
  };

  const handleConfirmChecking = async () => {
    if (!selectedOrder) return;

    // Validar que todos los ítems hayan sido verificados en el checklist
    const unverifiedCount = Object.values(checkedItemsState).filter(
      (val) => !val.verified,
    ).length;
    if (unverifiedCount > 0) {
      setErrorMsg(
        `Faltan auditar y verificar ${unverifiedCount} ítems en la lista de control.`,
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      orderId: selectedOrder.id,
      notes: notes.trim() || undefined,
      itemsChecked: Object.entries(checkedItemsState).map(
        ([orderItemId, data]) => ({
          orderItemId,
          quantityChecked: data.qty,
        }),
      ),
    };

    try {
      await checkingService.confirmChecking(payload);
      setSuccessMsg(
        `Pedido #${selectedOrder.orderNumber} verificado y pasado a estado AUDITADO (CHECKED).`,
      );
      setSelectedOrder(null);
      await loadPickedOrders();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al procesar la auditoría del pedido.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['WAREHOUSE_MANAGER', 'ADMIN']}>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 font-sans">
        {/* Encabezado Principal */}
        <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-sky-400 tracking-wide">
              Punto de Control 1 - Auditoría de Playa
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Verificación física de pedidos armados (PICKED) previas al
              despacho
            </p>
          </div>
          <button
            onClick={loadPickedOrders}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-semibold transition-colors border border-slate-600"
          >
            Actualizar
          </button>
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

        {/* Cargando... */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sky-400"></div>
            <p className="mt-4 text-slate-400 font-medium text-sm">
              Cargando pedidos para auditoría...
            </p>
          </div>
        ) : !selectedOrder ? (
          /* VISTA 1: Lista de Pedidos en Estado PICKED */
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <span>📋</span> Pedidos Armados Pendientes de Control (
              {orders.length})
            </h2>

            {orders.length === 0 ? (
              <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400">
                No hay pedidos en estado PICKED pendientes de auditoría en la
                playa.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-slate-800 border border-slate-700 hover:border-sky-500/50 rounded-xl p-5 flex flex-col justify-between transition-all shadow-lg"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-lg font-bold text-sky-400">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full font-bold">
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-100">
                        {order.customerName}
                      </p>
                      <p className="text-xs text-slate-400 mb-3">
                        CUIT: {order.customerCuit}
                      </p>

                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 space-y-1 mb-4 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            Armador (Picker):
                          </span>
                          <span className="font-semibold text-slate-200">
                            {order.pickerName || 'N/D'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            Bultos Armados:
                          </span>
                          <span className="font-semibold text-slate-200">
                            {order.totalBultos} bultos
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Peso Total:</span>
                          <span className="font-semibold text-slate-200">
                            {order.totalWeightKg} Kg
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectOrder(order)}
                      className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl transition-all shadow-md active:scale-[0.98] text-sm"
                    >
                      Iniciar Auditoría 🔍
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* VISTA 2: Formulario de Control e Inspección */
          <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold border border-slate-700"
              >
                ← Volver al Listado
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleVerifyAll}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30"
                >
                  ✓ Marcar Todo Verificado
                </button>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">
                    Auditando Pedido:
                  </span>
                  <span className="text-base font-extrabold text-sky-400">
                    #{selectedOrder.orderNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Ficha Resumen del Cliente y Pedido */}
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Cliente</span>
                <span className="text-sm font-bold text-white">
                  {selectedOrder.customerName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Depósito Origen</span>
                <span className="text-sm font-bold text-white">
                  {selectedOrder.warehouseName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">
                  Total Bultos / Peso
                </span>
                <span className="text-sm font-bold text-white">
                  {selectedOrder.totalBultos} bultos |{' '}
                  {selectedOrder.totalWeightKg} Kg
                </span>
              </div>
            </div>

            {/* Checklist de Ítems */}
            <div className="space-y-3 mb-6">
              {selectedOrder.items.map((item) => {
                const itemState = checkedItemsState[item.id] || {
                  qty: item.quantityPicked,
                  verified: false,
                };

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItemVerification(item.id)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center justify-between ${
                      itemState.verified
                        ? 'bg-emerald-950/20 border-emerald-500/80'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm ${
                          itemState.verified
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {itemState.verified ? '✓' : ''}
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-100">
                          {item.productName}
                        </p>
                        <p className="text-xs text-slate-400">
                          SKU: {item.productSku} | Empaque: {item.packagingUnit}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">
                        Recolectado:
                      </span>
                      <span className="text-base font-extrabold text-amber-400">
                        {item.quantityPicked} Bultos
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Observaciones de Auditoría */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Observaciones / Notas de Calidad (Opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Bulto n°3 reacondicionado con cinta de embalaje reforzada..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-sky-500 h-24 resize-none"
              />
            </div>

            {/* Botón de Aprobación */}
            <div className="sticky bottom-4 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl">
              <button
                type="button"
                onClick={handleConfirmChecking}
                disabled={submitting}
                className="w-full py-4 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 text-slate-950 font-black rounded-xl text-base sm:text-lg transition-all shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span>Aprobando Auditoría...</span>
                ) : (
                  <>
                    <span>🔒 APROBAR CONTROL Y MARCAR COMO CHECKED</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
