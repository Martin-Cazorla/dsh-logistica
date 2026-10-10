// frontend/src/app/dashboard/inventory/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { inventoryService } from '@/services/inventory.service';
import {
  WarehouseOccupancy,
  InventoryStock,
  PackingListItem,
  MoveStockDto,
  PhysicalLocation,
} from '@/types/inventory.types';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'MALLA' | 'INBOUND' | 'STOCK'>(
    'MALLA',
  );
  const [warehouses, setWarehouses] = useState<WarehouseOccupancy[]>([]);
  const [stockList, setStockList] = useState<InventoryStock[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);

  // Estado para búsqueda y filtro
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estados del Formulario Inbound / Packing List
  const [containerNumber, setContainerNumber] = useState<string>('');
  const [inboundWarehouseId, setInboundWarehouseId] = useState<string>('');
  const [packingList, setPackingList] = useState<PackingListItem[]>([
    {
      productSku: '',
      productName: '',
      eanCode: '',
      quantityBultosExpected: 1,
      weightPerBultoKg: 10,
      volumePerBultoM3: 0.1,
      locationId: '',
    },
  ]);

  // Estados de Relocalización (Mover Stock)
  const [selectedStockToMove, setSelectedStockToMove] =
    useState<InventoryStock | null>(null);
  const [targetLocationId, setTargetLocationId] = useState<string>('');
  const [qtyToMove, setQtyToMove] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inboundWarehouseId) {
      loadLocationsForWarehouse(inboundWarehouseId);
    }
  }, [inboundWarehouseId]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [whData, stData] = await Promise.all([
        inventoryService.getWarehouseOccupancy(),
        inventoryService.getStockList(),
      ]);
      setWarehouses(whData);
      setStockList(stData);
      if (whData.length > 0 && !inboundWarehouseId) {
        setInboundWarehouseId(whData[0].id);
      }
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al cargar los datos de inventario.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLocationsForWarehouse = async (whId: string) => {
    try {
      const locs = await inventoryService.getAvailableLocations(whId);
      setLocations(locs);
    } catch (err) {
      console.error('Error al cargar ubicaciones:', err);
    }
  };

  // --- MÉTODOS DE INBOUND / PACKING LIST ---
  const handleAddPackingItem = () => {
    setPackingList((prev) => [
      ...prev,
      {
        productSku: '',
        productName: '',
        eanCode: '',
        quantityBultosExpected: 1,
        weightPerBultoKg: 10,
        volumePerBultoM3: 0.1,
        locationId: '',
      },
    ]);
  };

  const handleUpdatePackingItem = (
    index: number,
    field: keyof PackingListItem,
    value: any,
  ) => {
    setPackingList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemovePackingItem = (index: number) => {
    setPackingList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmInbound = async () => {
    if (!inboundWarehouseId) {
      setErrorMsg('Debe seleccionar el depósito de destino.');
      return;
    }

    // Validar que todos los ítems tengan SKU, Nombre y Ubicación asignada
    for (let i = 0; i < packingList.length; i++) {
      const item = packingList[i];
      if (!item.productSku || !item.productName) {
        setErrorMsg(`El ítem #${i + 1} debe incluir SKU y Nombre de Producto.`);
        return;
      }
      if (!item.locationId) {
        setErrorMsg(
          `Debe asignar una Ubicación Física para el ítem #${i + 1} (${item.productName}).`,
        );
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      containerNumber: containerNumber.trim() || undefined,
      warehouseId: inboundWarehouseId,
      items: packingList.map((item) => ({
        productSku: item.productSku,
        productName: item.productName,
        eanCode: item.eanCode?.trim() || undefined,
        quantityBultos: Number(
          item.quantityBultosReceived ?? item.quantityBultosExpected,
        ),
        weightPerBultoKg: Number(item.weightPerBultoKg),
        volumePerBultoM3: Number(item.volumePerBultoM3),
        locationId: item.locationId!,
      })),
    };

    try {
      await inventoryService.receiveContainer(payload);
      setSuccessMsg(
        'Ingreso de mercadería y asignación de ubicaciones completado con éxito.',
      );
      setContainerNumber('');
      setPackingList([
        {
          productSku: '',
          productName: '',
          eanCode: '',
          quantityBultosExpected: 1,
          weightPerBultoKg: 10,
          volumePerBultoM3: 0.1,
          locationId: '',
        },
      ]);
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al procesar el ingreso de mercadería.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // --- MÉTODOS DE RELOCALIZACIÓN (MOVER STOCK) ---
  const handleOpenMoveModal = (stock: InventoryStock) => {
    setSelectedStockToMove(stock);
    setQtyToMove(1);
    setTargetLocationId('');
    loadLocationsForWarehouse(stock.warehouseId);
  };

  const handleConfirmMoveStock = async () => {
    if (!selectedStockToMove || !targetLocationId) {
      setErrorMsg('Seleccione una ubicación de destino válida.');
      return;
    }
    if (qtyToMove <= 0 || qtyToMove > selectedStockToMove.quantityBultos) {
      setErrorMsg(
        `La cantidad a mover debe estar entre 1 y ${selectedStockToMove.quantityBultos} bultos.`,
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload: MoveStockDto = {
      inventoryStockId: selectedStockToMove.id,
      targetLocationId,
      quantityBultosToMove: qtyToMove,
    };

    try {
      await inventoryService.moveStock(payload);
      setSuccessMsg(
        `MovidOS ${qtyToMove} bultos a la nueva posición exitosamente.`,
      );
      setSelectedStockToMove(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al mover el stock.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrar el stock mostrado
  const filteredStock = stockList.filter((item) => {
    const matchesSearch =
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.productSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.containerNumber &&
        item.containerNumber.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesWarehouse = selectedWarehouseId
      ? item.warehouseId === selectedWarehouseId
      : true;
    return matchesSearch && matchesWarehouse;
  });

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER']}>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 font-sans">
        {/* Encabezado */}
        <div className="flex flex-wrap justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-wide">
              Gestión de Inventario & Ocupación Física
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Control de bultos cerrados, contenedores, relocalización y mapa de
              depósitos
            </p>
          </div>

          {/* Navegación por Pestañas */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('MALLA')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'MALLA'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Malla de Ocupación
            </button>
            <button
              onClick={() => setActiveTab('INBOUND')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'INBOUND'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🚢 Ingreso Contenedor / Inbound
            </button>
            <button
              onClick={() => setActiveTab('STOCK')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'STOCK'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📦 Stock & Relocalización
            </button>
          </div>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="bg-red-950/80 border border-red-500/80 text-red-200 p-4 rounded-xl mb-6 text-sm font-semibold flex justify-between items-center">
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold underline"
            >
              Cerrar
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 p-4 rounded-xl mb-6 text-sm font-semibold flex justify-between items-center">
            <span>✅ {successMsg}</span>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-xs font-bold underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-400"></div>
            <p className="mt-4 text-slate-400 font-medium text-sm">
              Cargando malla física y niveles de stock...
            </p>
          </div>
        ) : (
          <>
            {/* PESTAÑA 1: MALLA VISUAL DE OCUPACIÓN */}
            {activeTab === 'MALLA' && (
              <div className="space-y-6">
                {/* Indicadores Globales por Depósito */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {warehouses.map((wh) => {
                    const isHigh = wh.occupancyPercentage >= 90;
                    const isMedium =
                      wh.occupancyPercentage >= 50 &&
                      wh.occupancyPercentage < 90;

                    return (
                      <div
                        key={wh.id}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-extrabold text-sm text-slate-100">
                            {wh.name}
                          </h3>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              isHigh
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : isMedium
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {wh.occupancyPercentage}%
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 mb-3 space-y-1">
                          <p>
                            Ocupado:{' '}
                            <strong className="text-white">
                              {wh.usedCapacityM3} m³
                            </strong>{' '}
                            / {wh.totalCapacityM3} m³
                          </p>
                          <p>
                            Posiciones:{' '}
                            <strong className="text-white">
                              {wh.occupiedLocations}
                            </strong>{' '}
                            de {wh.totalLocations}
                          </p>
                        </div>

                        {/* Barra de Progreso */}
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              isHigh
                                ? 'bg-red-500'
                                : isMedium
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min(100, wh.occupancyPercentage)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desglose Físico por Pasillos y Racks */}
                {warehouses.map((wh) => (
                  <div
                    key={wh.id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl"
                  >
                    <h2 className="text-base font-extrabold text-amber-400 mb-4 flex items-center gap-2">
                      <span>🏬</span> {wh.name} — Pasillos & Ubicaciones Físicas
                    </h2>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {wh.locations.map((loc) => {
                        const isFull = loc.occupancyPercentage >= 90;
                        const isPartial =
                          loc.occupancyPercentage >= 50 &&
                          loc.occupancyPercentage < 90;

                        return (
                          <div
                            key={loc.id}
                            className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                              isFull
                                ? 'bg-red-950/20 border-red-500/40'
                                : isPartial
                                  ? 'bg-amber-950/20 border-amber-500/40'
                                  : 'bg-emerald-950/20 border-emerald-500/40'
                            }`}
                          >
                            <div>
                              <span className="font-black text-slate-100 block text-sm">
                                {loc.code}
                              </span>
                              <span className="text-[10px] text-slate-400 block mb-1">
                                {loc.aisle}
                              </span>
                              {loc.comments && (
                                <p className="text-[10px] text-amber-300/80 italic mb-2 line-clamp-1">
                                  {loc.comments}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                              <span
                                className={`font-bold ${
                                  isFull
                                    ? 'text-red-400'
                                    : isPartial
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                }`}
                              >
                                {loc.occupancyPercentage}% Ocup.
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {loc.usedCapacityM3}m³
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PESTAÑA 2: INBOUND / RECEPTOR DE CONTENEDORES */}
            {activeTab === 'INBOUND' && (
              <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl space-y-6">
                <div className="border-b border-slate-800 pb-4">
                  <h2 className="text-lg font-bold text-amber-400">
                    Control de Arribo & Packing List
                  </h2>
                  <p className="text-xs text-slate-400">
                    Registre el contenedor o remito de ingreso, verifique
                    cantidades reales y asigne ubicaciones definitivas.
                  </p>
                </div>

                {/* Cabecera del Inbound */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Número de Contenedor / Remito (Opcional)
                    </label>
                    <input
                      type="text"
                      value={containerNumber}
                      onChange={(e) => setContainerNumber(e.target.value)}
                      placeholder="Ej. MSCU-984021-3 / Remito #8841"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Depósito de Descarga *
                    </label>
                    <select
                      value={inboundWarehouseId}
                      onChange={(e) => setInboundWarehouseId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} (Ocupación actual: {wh.occupancyPercentage}
                          %)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tabla de Packing List Dinámica */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200">
                      Detalle de Bultos a Ingresar
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddPackingItem}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-lg text-xs border border-slate-700"
                    >
                      + Agregar Producto
                    </button>
                  </div>

                  <div className="space-y-3">
                    {packingList.map((item, index) => (
                      <div
                        key={index}
                        className="bg-slate-950 border border-slate-800 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3 items-center"
                      >
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            SKU *
                          </label>
                          <input
                            type="text"
                            value={item.productSku}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'productSku',
                                e.target.value,
                              )
                            }
                            placeholder="SKU-102"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Producto *
                          </label>
                          <input
                            type="text"
                            value={item.productName}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'productName',
                                e.target.value,
                              )
                            }
                            placeholder="Caja Kit Herramientas x12"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Bultos Reales
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantityBultosExpected}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'quantityBultosExpected',
                                Number(e.target.value),
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-amber-400 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Peso/Bulto (Kg)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={item.weightPerBultoKg}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'weightPerBultoKg',
                                Number(e.target.value),
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Ubicación Destino *
                          </label>
                          <select
                            value={item.locationId || ''}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'locationId',
                                e.target.value,
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                          >
                            <option value="">-- Posición --</option>
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.code} ({loc.aisle})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex justify-end sm:col-span-2 md:col-span-1">
                          {packingList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePackingItem(index)}
                              className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 rounded text-xs border border-red-800"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={handleConfirmInbound}
                    disabled={submitting}
                    className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg active:scale-[0.98]"
                  >
                    {submitting
                      ? 'Procesando Ingreso...'
                      : '📥 CONFIRMAR INGRESO & UBICAR MERCADERÍA'}
                  </button>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: LISTADO DE STOCK & RELOCALIZACIÓN INTERNA */}
            {activeTab === 'STOCK' && (
              <div className="space-y-4">
                {/* Filtros de Búsqueda */}
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 justify-between items-center">
                  <div className="flex flex-wrap gap-3 items-center flex-1">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por SKU, Producto, Posición o Contenedor..."
                      className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 min-w-[280px] focus:outline-none focus:border-amber-500"
                    />

                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Todos los Depósitos</option>
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-xs text-slate-400 font-bold">
                    Mostrando {filteredStock.length} registros de stock
                  </span>
                </div>

                {/* Tabla de Stock Registrado */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">Producto / SKU</th>
                          <th className="p-3.5">Depósito</th>
                          <th className="p-3.5">Posición Física</th>
                          <th className="p-3.5 text-center">Bultos Cerrados</th>
                          <th className="p-3.5 text-right">Peso Total</th>
                          <th className="p-3.5 text-right">Volumen</th>
                          <th className="p-3.5 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {filteredStock.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="p-8 text-center text-slate-500"
                            >
                              No se encontraron registros de stock que coincidan
                              con los filtros.
                            </td>
                          </tr>
                        ) : (
                          filteredStock.map((stock) => (
                            <tr
                              key={stock.id}
                              className="hover:bg-slate-800/50 transition-colors"
                            >
                              <td className="p-3.5">
                                <span className="font-bold text-white block">
                                  {stock.productName}
                                </span>
                                <span className="text-[11px] text-amber-400">
                                  SKU: {stock.productSku}
                                </span>
                                {stock.containerNumber && (
                                  <span className="text-[10px] text-slate-400 block">
                                    Contenedor: {stock.containerNumber}
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-slate-300 font-semibold">
                                {stock.warehouseName}
                              </td>
                              <td className="p-3.5">
                                <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono font-bold text-white">
                                  📍 {stock.locationCode}
                                </span>
                              </td>
                              <td className="p-3.5 text-center font-black text-amber-400 text-sm">
                                {stock.quantityBultos} cjs
                              </td>
                              <td className="p-3.5 text-right font-bold text-slate-200">
                                {stock.totalWeightKg} Kg
                              </td>
                              <td className="p-3.5 text-right font-bold text-slate-400">
                                {stock.totalVolumeM3} m³
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenMoveModal(stock)}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-bold border border-slate-700 transition-all text-[11px]"
                                >
                                  🔄 Mover Stock
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* MODAL DE RELOCALIZACIÓN INTERNA */}
                {selectedStockToMove && (
                  <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
                      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                        <div>
                          <h3 className="font-bold text-amber-400 text-base">
                            Relocalización de Stock
                          </h3>
                          <p className="text-xs text-slate-400">
                            {selectedStockToMove.productName}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedStockToMove(null)}
                          className="text-slate-400 hover:text-white font-bold text-sm"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                        <p className="text-slate-400">
                          Ubicación Actual:{' '}
                          <strong className="text-white">
                            {selectedStockToMove.locationCode}
                          </strong>
                        </p>
                        <p className="text-slate-400">
                          Bultos Disponibles:{' '}
                          <strong className="text-amber-400">
                            {selectedStockToMove.quantityBultos} bultos
                          </strong>
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Cantidad de Bultos a Mover
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={selectedStockToMove.quantityBultos}
                          value={qtyToMove}
                          onChange={(e) => setQtyToMove(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-amber-400 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Nueva Posición Física (Destino)
                        </label>
                        <select
                          value={targetLocationId}
                          onChange={(e) => setTargetLocationId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- Seleccionar Posición --</option>
                          {locations
                            .filter(
                              (loc) =>
                                loc.id !== selectedStockToMove.locationId,
                            )
                            .map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.code} ({loc.aisle})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="pt-2 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedStockToMove(null)}
                          className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmMoveStock}
                          disabled={submitting}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
                        >
                          {submitting ? 'Guardando...' : 'Confirmar Traslado'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
