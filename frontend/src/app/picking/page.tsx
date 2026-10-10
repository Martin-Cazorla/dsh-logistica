// frontend/src/app/picking/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { pickingService } from '@/services/picking.service';
import { PickingOrder, PickingOrderItem } from '@/types/picking.types';

export default function PickingPage() {
  const [orders, setOrders] = useState<PickingOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PickingOrder | null>(null);
  const [itemsState, setItemsState] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cargar pedidos asignados al montar la vista
  useEffect(() => {
    loadAssignedOrders();
  }, []);

  const loadAssignedOrders = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await pickingService.getAssignedOrders();
      setOrders(data);
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al cargar los pedidos de picking.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Seleccionar un pedido para iniciar la recolección
  const handleSelectOrder = (order: PickingOrder) => {
    setSelectedOrder(order);
    // Inicializar cantidades recolectadas con las requeridas por defecto
    const initialState: Record<string, number> = {};
    order.items.forEach((item) => {
      initialState[item.id] = item.quantityRequested;
    });
    setItemsState(initialState);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Manejar el incremento / decremento de bultos con botones táctiles gigantes
  const handleQuantityChange = (
    itemId: string,
    delta: number,
    maxQty: number,
  ) => {
    setItemsState((prev) => {
      const current = prev[itemId] || 0;
      const updated = Math.min(Math.max(0, current + delta), maxQty);
      return { ...prev, [itemId]: updated };
    });
  };

  // Confirmar el armado total del pedido
  const handleConfirmPicking = async () => {
    if (!selectedOrder) return;

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      orderId: selectedOrder.id,
      itemsPicked: Object.entries(itemsState).map(
        ([orderItemId, quantityPicked]) => ({
          orderItemId,
          quantityPicked,
        }),
      ),
    };

    try {
      await pickingService.confirmPicking(payload);
      setSuccessMsg(
        `Pedido #${selectedOrder.orderNumber} marcado como ARMADO (PICKED) exitosamente.`,
      );
      setSelectedOrder(null);
      await loadAssignedOrders();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al registrar el picking.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['PICKER', 'WAREHOUSE_MANAGER', 'ADMIN']}>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 font-sans">
        {/* Encabezado Principal */}
        <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-amber-400 tracking-wide">
              Móvil de Picking & Armado
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Operativa de bultos cerrados para colectoras táctiles
            </p>
          </div>
          <button
            onClick={loadAssignedOrders}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-semibold transition-colors border border-slate-600"
          >
            Actualizar
          </button>
        </div>

        {/* Mensajes de Notificación */}
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

        {/* Carga Inicial */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-400"></div>
            <p className="mt-4 text-slate-400 font-medium text-sm">
              Cargando hojas de picking...
            </p>
          </div>
        ) : !selectedOrder ? (
          /* VISTA 1: Lista de Pedidos Asignados */
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <span>📦</span> Pedidos Pendientes de Armado ({orders.length})
            </h2>

            {orders.length === 0 ? (
              <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 text-center text-slate-400">
                No hay pedidos asignados para armado en este momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-slate-800 border border-slate-700 hover:border-amber-500/50 rounded-xl p-5 flex flex-col justify-between transition-all shadow-lg"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-lg font-bold text-amber-400">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full font-bold">
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-200 mb-1">
                        {order.customerName}
                      </p>
                      <p className="text-xs text-slate-400 mb-3">
                        Depósito: {order.warehouseName}
                      </p>

                      <div className="flex justify-between text-xs bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 mb-4">
                        <div>
                          <span className="text-slate-500 block">
                            Bultos Totales
                          </span>
                          <span className="text-sm font-bold text-slate-200">
                            {order.totalBultos} cjs/pallets
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 block">
                            Peso Estimado
                          </span>
                          <span className="text-sm font-bold text-slate-200">
                            {order.totalWeightKg} Kg
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSelectOrder(order)}
                      className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl transition-all shadow-md active:scale-[0.98] text-base"
                    >
                      Iniciar Armado ➔
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* VISTA 2: Detalle Táctil del Pedido Seleccionado */
          <div>
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold border border-slate-700"
              >
                ← Volver a la Lista
              </button>
              <div className="text-right">
                <span className="text-xs text-slate-400">Armando Pedido:</span>
                <p className="text-base font-extrabold text-amber-400">
                  #{selectedOrder.orderNumber}
                </p>
              </div>
            </div>

            {/* Lista de Ítems a Recolectar por Ubicación */}
            <div className="space-y-4 mb-6">
              {selectedOrder.items.map((item, index) => {
                const currentQty = itemsState[item.id] || 0;
                const isComplete = currentQty === item.quantityRequested;

                return (
                  <div
                    key={item.id}
                    className={`bg-slate-800 border rounded-xl p-4 sm:p-5 transition-all shadow-md ${
                      isComplete
                        ? 'border-emerald-500/60 bg-emerald-950/10'
                        : 'border-slate-700'
                    }`}
                  >
                    {/* Ubicación Física en Depósito */}
                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold text-base">
                          📍 Posición {index + 1}:
                        </span>
                        <span className="text-sm font-extrabold text-white tracking-wider">
                          {item.location
                            ? item.location.code
                            : 'Ubicación General'}
                        </span>
                      </div>
                      {item.location?.comments && (
                        <span className="text-xs text-amber-300/80 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                          {item.location.comments}
                        </span>
                      )}
                    </div>

                    {/* Información del Producto */}
                    <div className="mb-4">
                      <p className="text-base font-bold text-slate-100">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        SKU: {item.product.sku} | Unidad:{' '}
                        {item.product.packagingUnit}
                      </p>
                    </div>

                    {/* Selector Táctil Gigante de Cantidades */}
                    <div className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-700">
                      <span className="text-xs font-bold text-slate-400 pl-2">
                        Requeridos:{' '}
                        <strong className="text-white text-sm">
                          {item.quantityRequested}
                        </strong>
                      </span>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleQuantityChange(
                              item.id,
                              -1,
                              item.quantityRequested,
                            )
                          }
                          className="w-12 h-12 bg-slate-700 active:bg-slate-600 text-white font-extrabold rounded-lg text-xl flex items-center justify-center border border-slate-600 shadow"
                        >
                          -
                        </button>

                        <span className="text-xl font-black text-amber-400 min-w-[2.5rem] text-center">
                          {currentQty}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            handleQuantityChange(
                              item.id,
                              1,
                              item.quantityRequested,
                            )
                          }
                          className="w-12 h-12 bg-amber-500 active:bg-amber-400 text-slate-950 font-extrabold rounded-lg text-xl flex items-center justify-center shadow"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón Flotante/Final de Confirmación de Armado */}
            <div className="sticky bottom-4 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl">
              <button
                type="button"
                onClick={handleConfirmPicking}
                disabled={submitting}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-950 font-black rounded-xl text-lg transition-all shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span>Registrando Armado...</span>
                ) : (
                  <>
                    <span>✅ CONFIRMAR ARMADO COMPLETO</span>
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
