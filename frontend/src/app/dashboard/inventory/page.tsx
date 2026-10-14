// frontend/src/app/dashboard/inventory/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { inventoryService } from '@/services/inventory.service';
import PalletLabelModal from '@/components/PalletLabelModal';
import {
  WarehouseOccupancy,
  InventoryStock,
  PackingListItem,
  PhysicalLocation,
  LocationTypeCategory,
  PalletLabelData,
} from '@/types/inventory.types';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<
    'MALLA' | 'INBOUND' | 'HISTORIAL' | 'STOCK' | 'CONFIG'
  >('MALLA');

  const [warehouses, setWarehouses] = useState<WarehouseOccupancy[]>([]);
  const [simpleWarehousesList, setSimpleWarehousesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [stockList, setStockList] = useState<InventoryStock[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [containersHistory, setContainersHistory] = useState<any[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [printModalData, setPrintModalData] = useState<PalletLabelData | null>(
    null,
  );

  // Pre-carga Inbound (Fase 1)
  const [containerNumber, setContainerNumber] = useState<string>('');
  const [inboundWarehouseId, setInboundWarehouseId] = useState<string>('');
  const [packingList, setPackingList] = useState<PackingListItem[]>([
    {
      productSku: 'US26615',
      productName: 'Casco de bici',
      quantityBultosExpected: 30,
      totalUnitsExpected: 900,
      unitsPerBox: 30,
      weightPerBultoKg: 10,
      lengthCm: 40,
      widthCm: 30,
      heightCm: 30,
      volumePerBultoM3: 0.036,
      sampleUnits: 0,
      notes: 'Sin novedades',
      entryDate: new Date().toISOString().split('T')[0],
      category: 'RACK',
      zoneName: 'Rack Izquierda',
      rackLevel: 'A',
      moduleNumber: 1,
      locationId: '',
    },
  ]);

  // Selección para Descarga Móvil (Fase 2)
  const [selectedPendingContainerId, setSelectedPendingContainerId] =
    useState<string>('');

  // Mantenimiento Ubicaciones
  const [newWhName, setNewWhName] = useState<string>('');
  const [targetConfigWhId, setTargetConfigWhId] = useState<string>('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('ALL');

  const [genCategory, setGenCategory] = useState<LocationTypeCategory>('RACK');
  const [genAreaName, setGenAreaName] = useState<string>('Rack Izquierda');
  const [genLevelsInput, setGenLevelsInput] = useState<string>('A, B, C');
  const [genPosStart, setGenPosStart] = useState<number>(1);
  const [genPosEnd, setGenPosEnd] = useState<number>(84);
  const [genCapacityM3, setGenCapacityM3] = useState<number>(2.5);

  const [selectedLocIdsForDelete, setSelectedLocIdsForDelete] = useState<
    string[]
  >([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inboundWarehouseId) {
      loadLocationsForWarehouse(inboundWarehouseId);
    }
  }, [inboundWarehouseId]);

  useEffect(() => {
    if (targetConfigWhId) {
      loadLocationsForWarehouse(targetConfigWhId);
      setSelectedAreaFilter('ALL');
    }
  }, [targetConfigWhId]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [whData, whList, stData, contData] = await Promise.all([
        inventoryService.getWarehouseOccupancy(),
        inventoryService.getWarehousesList(),
        inventoryService.getStockList(),
        inventoryService.getContainersHistory(),
      ]);
      setWarehouses(whData);
      setSimpleWarehousesList(whList);
      setStockList(stData);
      setContainersHistory(contData as any[]);

      if (whList.length > 0) {
        if (
          !inboundWarehouseId ||
          !whList.some((w: { id: string }) => w.id === inboundWarehouseId)
        ) {
          setInboundWarehouseId(whList[0].id);
        }
        if (
          !targetConfigWhId ||
          !whList.some((w: { id: string }) => w.id === targetConfigWhId)
        ) {
          setTargetConfigWhId(whList[0].id);
        }
      }
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error de conexión con el servidor.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLocationsForWarehouse = async (whId: string) => {
    if (!whId) {
      setLocations([]);
      return;
    }
    try {
      const locs = await inventoryService.getAvailableLocations(whId);
      setLocations(locs);
      setSelectedLocIdsForDelete([]);
    } catch (err) {
      console.error('Error al cargar ubicaciones:', err);
    }
  };

  const pendingContainers = useMemo(
    () => containersHistory.filter((c) => c.status === 'PENDIENTE'),
    [containersHistory],
  );

  const visibleLocationsInMaintenance = useMemo(() => {
    if (selectedAreaFilter === 'ALL') return locations;
    return locations.filter((l) => l.zoneName === selectedAreaFilter);
  }, [locations, selectedAreaFilter]);

  const availableAreasInWarehouse = useMemo(() => {
    const areas = new Set<string>();
    locations.forEach((l) => {
      if (l.zoneName) areas.add(l.zoneName);
    });
    return Array.from(areas);
  }, [locations]);

  const handleCreateWarehouse = async () => {
    if (!newWhName.trim()) {
      setErrorMsg('Escriba el nombre del depósito.');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryService.createWarehouse({ name: newWhName.trim() });
      setSuccessMsg(`Depósito "${newWhName}" creado correctamente.`);
      setNewWhName('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al crear el depósito.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePackingList = async () => {
    if (!containerNumber.trim()) {
      setErrorMsg('El número de contenedor es obligatorio.');
      return;
    }
    if (!inboundWarehouseId) {
      setErrorMsg('Seleccione un depósito de descarga.');
      return;
    }

    setSubmitting(true);
    try {
      await inventoryService.createPackingList({
        containerNumber: containerNumber.trim(),
        warehouseId: inboundWarehouseId,
        items: packingList.map((item) => ({
          productSku: item.productSku,
          productName: item.productName,
          quantityBultos: item.quantityBultosExpected,
          unitsPerBox: item.unitsPerBox,
          weightPerBultoKg: item.weightPerBultoKg,
          volumePerBultoM3: item.volumePerBultoM3,
          sampleUnits: item.sampleUnits,
          notes: item.notes,
          locationId: item.locationId || locations[0]?.id || '',
        })),
      });

      setSuccessMsg(
        `Packing List para contenedor "${containerNumber}" pre-cargado con éxito.`,
      );
      setContainerNumber('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al pre-cargar el Packing List.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessInboundDischarge = async () => {
    if (!selectedPendingContainerId) {
      setErrorMsg(
        'Seleccione un contenedor pendiente para procesar la descarga.',
      );
      return;
    }

    const selectedCont = pendingContainers.find(
      (c) => c.id === selectedPendingContainerId,
    );
    if (!selectedCont) return;

    setSubmitting(true);
    try {
      await inventoryService.processInbound(
        selectedPendingContainerId,
        selectedCont.items.map((i: any) => ({
          sku: i.sku,
          description: i.description,
          quantityBultos: i.quantityBultos,
          unitsPerBox: i.unitsPerBox,
          weightPerBultoKg: i.weightPerBultoKg,
          volumePerBultoM3: i.volumePerBultoM3,
          locationId: i.locationId || locations[0]?.id,
        })),
      );

      setSuccessMsg(
        `Contenedor "${selectedCont.containerNumber}" descargado e ingresado al stock.`,
      );
      setSelectedPendingContainerId('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'Error al procesar la descarga del contenedor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContainer = async (id: string, num: string) => {
    if (!confirm(`¿Confirma eliminar el contenedor "${num}"?`)) return;
    setSubmitting(true);
    try {
      await inventoryService.deleteContainer(id);
      setSuccessMsg(`Contenedor "${num}" eliminado de la base.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al eliminar el contenedor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!targetConfigWhId) return;
    const levels = genLevelsInput
      .split(',')
      .map((l) => l.trim().toUpperCase())
      .filter(Boolean);

    setSubmitting(true);
    try {
      await inventoryService.generateBatchLocations({
        warehouseId: targetConfigWhId,
        category: genCategory,
        areaName: genAreaName.trim(),
        levels,
        positionStart: Number(genPosStart),
        positionEnd: Number(genPosEnd),
        maxCapacityM3PerUnit: Number(genCapacityM3) || 2,
      });
      setSuccessMsg('Ubicaciones generadas exitosamente.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al generar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSelectedLocations = async () => {
    if (selectedLocIdsForDelete.length === 0) return;
    if (
      !confirm(
        `¿Confirma eliminar las ${selectedLocIdsForDelete.length} ubicaciones seleccionadas?`,
      )
    )
      return;

    setSubmitting(true);
    try {
      await inventoryService.deleteLocationsBatch(selectedLocIdsForDelete);
      setSuccessMsg('Ubicaciones eliminadas en lote.');
      setSelectedLocIdsForDelete([]);
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al eliminar posiciones.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFullWarehouse = async () => {
    if (!targetConfigWhId) return;
    const wh = simpleWarehousesList.find((w) => w.id === targetConfigWhId);
    if (
      !confirm(
        `Confirma eliminar el depósito "${wh?.name}" y TODAS sus ubicaciones?`,
      )
    )
      return;

    setSubmitting(true);
    try {
      await inventoryService.deleteWarehouse(targetConfigWhId);
      setSuccessMsg(`Depósito "${wh?.name}" eliminado completamente.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'No se puede eliminar un depósito con stock activo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER']}>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 font-sans">
        <div className="flex flex-wrap justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-wide">
              Gestión de Inventario & Control Móvil
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Pre-carga de Packing List, descarga móvil desde celular, historial
              y rotulado A4
            </p>
          </div>

          <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
            <button
              onClick={() => setActiveTab('MALLA')}
              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                activeTab === 'MALLA'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400'
              }`}
            >
              Malla Ocupación
            </button>
            <button
              onClick={() => setActiveTab('INBOUND')}
              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                activeTab === 'INBOUND'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400'
              }`}
            >
              Control Móvil & Pre-Carga
            </button>
            <button
              onClick={() => setActiveTab('HISTORIAL')}
              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                activeTab === 'HISTORIAL'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400'
              }`}
            >
              Historial Contenedores
            </button>
            <button
              onClick={() => setActiveTab('STOCK')}
              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                activeTab === 'STOCK'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400'
              }`}
            >
              Stock & Rótulos
            </button>
            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-2 rounded-lg text-xs font-bold ${
                activeTab === 'CONFIG'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400'
              }`}
            >
              Mantenimiento Ubicaciones
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-950/80 border border-red-500/80 text-red-200 p-4 rounded-xl mb-6 text-sm flex justify-between items-center">
            <span>Atención: {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold underline"
            >
              Cerrar
            </button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 p-4 rounded-xl mb-6 text-sm flex justify-between items-center">
            <span>Éxito: {successMsg}</span>
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
            <p className="mt-4 text-slate-400 text-sm">
              Cargando inventario...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'MALLA' && (
              <div className="space-y-6">
                {warehouses.map((wh) => (
                  <div
                    key={wh.id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-2xl"
                  >
                    <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                      <div>
                        <h2 className="text-base font-extrabold text-amber-400">
                          Depósito: {wh.name}
                        </h2>
                        <p className="text-xs text-slate-400">
                          Ocupación: {wh.usedCapacityM3} m3 /{' '}
                          {wh.totalCapacityM3} m3
                        </p>
                      </div>
                      <span className="text-xs bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-slate-300 font-bold">
                        {wh.locations.length} Posiciones
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                      {wh.locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="p-3 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                        >
                          <span className="font-black text-white block">
                            {loc.code}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {loc.zoneName} ({loc.maxCapacityM3} m3)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'INBOUND' && (
              <div className="space-y-6">
                {/* PRE-CARGA FASE 1 */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 1: Pre-carga de Contenedores / Packing List
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Número de Contenedor / Remito *
                      </label>
                      <input
                        type="text"
                        value={containerNumber}
                        onChange={(e) => setContainerNumber(e.target.value)}
                        placeholder="Ej. MSCU-984021-3"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Depósito de Descarga *
                      </label>
                      <select
                        value={inboundWarehouseId}
                        onChange={(e) => setInboundWarehouseId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      >
                        {simpleWarehousesList.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleSavePackingList}
                    disabled={submitting}
                    className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs"
                  >
                    PRE-CARGAR PACKING LIST EN BASE DE DATOS
                  </button>
                </div>

                {/* DESCARGA MÓVIL FASE 2 */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 2: Control Móvil y Descarga Físico-Estibado
                  </h2>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Seleccionar Contenedor Arribado *
                    </label>
                    <select
                      value={selectedPendingContainerId}
                      onChange={(e) =>
                        setSelectedPendingContainerId(e.target.value)
                      }
                      className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-3 text-sm text-amber-300 font-bold"
                    >
                      <option value="">
                        -- Seleccione Contenedor Pendiente --
                      </option>
                      {pendingContainers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.containerNumber} - Depósito: {c.warehouseName} (
                          {c.totalBultos} bultos)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPendingContainerId && (
                    <button
                      onClick={handleProcessInboundDischarge}
                      disabled={submitting}
                      className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs"
                    >
                      CONFIRMAR DESCARGA E INGRESO AL STOCK
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'HISTORIAL' && (
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                  Historial de Contenedores e Inbound
                </h2>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Contenedor / Remito</th>
                        <th className="p-3">Depósito</th>
                        <th className="p-3">Fecha Pre-carga</th>
                        <th className="p-3">Fecha Descarga</th>
                        <th className="p-3">Bultos</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {containersHistory.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-950/50">
                          <td className="p-3 font-mono font-bold text-amber-400">
                            {c.containerNumber}
                          </td>
                          <td className="p-3 font-bold text-white">
                            {c.warehouseName}
                          </td>
                          <td className="p-3">
                            {new Date(c.arrivalDate).toLocaleDateString(
                              'es-AR',
                            )}
                          </td>
                          <td className="p-3">
                            {c.dischargeDate
                              ? new Date(c.dischargeDate).toLocaleDateString(
                                  'es-AR',
                                )
                              : 'Pendiente'}
                          </td>
                          <td className="p-3 font-bold">{c.totalBultos}</td>
                          <td className="p-3 font-bold">
                            <span
                              className={`px-2 py-1 rounded text-[10px] ${
                                c.status === 'RECIBIDO'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="p-3">
                            {c.status === 'PENDIENTE' && (
                              <button
                                onClick={() =>
                                  handleDeleteContainer(c.id, c.containerNumber)
                                }
                                className="px-2.5 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[10px] font-bold"
                              >
                                Anular / Eliminar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'STOCK' && (
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <h2 className="text-base font-bold text-amber-400">
                  Control de Stock e Impresión de Rótulos A4
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3">Ubicación</th>
                        <th className="p-3">Bultos</th>
                        <th className="p-3">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {stockList.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-950/50">
                          <td className="p-3 font-mono text-amber-400">
                            {st.productSku}
                          </td>
                          <td className="p-3 font-bold text-white">
                            {st.productName}
                          </td>
                          <td className="p-3">{st.locationCode}</td>
                          <td className="p-3 font-bold text-emerald-400">
                            {st.quantityBultos}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() =>
                                setPrintModalData({
                                  productSku: st.productSku,
                                  productName: st.productName,
                                  quantityBultos: st.quantityBultos,
                                  unitsPerBox: st.unitsPerBox || 1,
                                  containerNumber: st.containerNumber || 'N/A',
                                  locationCode: st.locationCode,
                                  warehouseName: st.warehouseName,
                                  weightPerBultoKg: st.weightPerBultoKg,
                                  volumePerBultoM3: st.volumePerBultoM3,
                                  date: new Date(
                                    st.updatedAt,
                                  ).toLocaleDateString('es-AR'),
                                })
                              }
                              className="px-3 py-1 bg-amber-500 text-slate-950 font-black rounded-lg text-[10px]"
                            >
                              IMPRIMIR RÓTULO
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'CONFIG' && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2 mb-4">
                    Alta Nuevo Depósito
                  </h2>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newWhName}
                      onChange={(e) => setNewWhName(e.target.value)}
                      placeholder="Nombre del Depósito (Ej. Murguiondo, Chile 1...)"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    />
                    <button
                      onClick={handleCreateWarehouse}
                      disabled={submitting}
                      className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs"
                    >
                      + CREAR DEPÓSITO
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* GENERADOR DE UBICACIONES */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                      Generador Inteligente por Rangos
                    </h2>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Depósito Destino *
                      </label>
                      <select
                        value={targetConfigWhId}
                        onChange={(e) => setTargetConfigWhId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      >
                        {simpleWarehousesList.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">
                          Estructura
                        </label>
                        <select
                          value={genCategory}
                          onChange={(e) =>
                            setGenCategory(
                              e.target.value as LocationTypeCategory,
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        >
                          <option value="RACK">Rack (Pared / Módulos)</option>
                          <option value="PASILLO">Pasillo Especial</option>
                          <option value="TECHO">Techo</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">
                          Capacidad m3 por Posición
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={genCapacityM3}
                          onChange={(e) =>
                            setGenCapacityM3(Number(e.target.value))
                          }
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Nombre del Área / Rack
                      </label>
                      <input
                        type="text"
                        value={genAreaName}
                        onChange={(e) => setGenAreaName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">
                          Niveles (Comas)
                        </label>
                        <input
                          type="text"
                          value={genLevelsInput}
                          onChange={(e) => setGenLevelsInput(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">
                          Rangos (Desde - Hasta)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={genPosStart}
                            onChange={(e) =>
                              setGenPosStart(Number(e.target.value))
                            }
                            className="w-1/2 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold text-center"
                          />
                          <input
                            type="number"
                            value={genPosEnd}
                            onChange={(e) =>
                              setGenPosEnd(Number(e.target.value))
                            }
                            className="w-1/2 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold text-center"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateBatch}
                      disabled={submitting}
                      className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs"
                    >
                      GENERAR LOTE DE UBICACIONES
                    </button>
                  </div>

                  {/* MANTENIMIENTO Y SELECCIÓN MASIVA */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h2 className="text-base font-bold text-amber-400">
                          Mantenimiento Masivo
                        </h2>
                        <button
                          onClick={handleDeleteFullWarehouse}
                          className="px-2.5 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[11px] font-bold"
                        >
                          Borrar Depósito Completo
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1 font-bold">
                            1. Filtrar Depósito
                          </label>
                          <select
                            value={targetConfigWhId}
                            onChange={(e) =>
                              setTargetConfigWhId(e.target.value)
                            }
                            className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                          >
                            {simpleWarehousesList.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1 font-bold">
                            2. Filtrar Bloque / Área
                          </label>
                          <select
                            value={selectedAreaFilter}
                            onChange={(e) =>
                              setSelectedAreaFilter(e.target.value)
                            }
                            className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                          >
                            <option value="ALL">
                              Todos los Bloques ({locations.length})
                            </option>
                            {availableAreasInWarehouse.map((area) => (
                              <option key={area} value={area}>
                                {area} (
                                {
                                  locations.filter((l) => l.zoneName === area)
                                    .length
                                }{' '}
                                pos)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                        {visibleLocationsInMaintenance.map((loc) => {
                          const isSelected = selectedLocIdsForDelete.includes(
                            loc.id,
                          );
                          return (
                            <div
                              key={loc.id}
                              onClick={() =>
                                setSelectedLocIdsForDelete((prev) =>
                                  prev.includes(loc.id)
                                    ? prev.filter((id) => id !== loc.id)
                                    : [...prev, loc.id],
                                )
                              }
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer ${
                                isSelected
                                  ? 'bg-red-950/30 border-red-500'
                                  : 'bg-slate-950 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="accent-red-500 w-4 h-4"
                                />
                                <div>
                                  <strong className="text-white block">
                                    {loc.code}
                                  </strong>
                                  <span className="text-slate-400 text-[10px]">
                                    {loc.zoneName}
                                  </span>
                                </div>
                              </div>
                              <span className="text-amber-400 font-bold">
                                {loc.maxCapacityM3} m3
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {selectedLocIdsForDelete.length > 0 && (
                      <button
                        onClick={handleDeleteSelectedLocations}
                        disabled={submitting}
                        className="w-full py-3 bg-red-600 text-white font-black rounded-xl text-xs"
                      >
                        ELIMINAR {selectedLocIdsForDelete.length} POSICIONES
                        SELECCIONADAS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <PalletLabelModal
          data={printModalData}
          onClose={() => setPrintModalData(null)}
        />
      </div>
    </ProtectedRoute>
  );
}
