// frontend/src/app/dashboard/inventory/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { inventoryService } from '@/services/inventory.service';
import {
  WarehouseOccupancy,
  InventoryStock,
  PackingListItem,
  PhysicalLocation,
  LocationTypeCategory,
} from '@/types/inventory.types';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<
    'MALLA' | 'INBOUND' | 'STOCK' | 'CONFIG'
  >('MALLA');
  const [warehouses, setWarehouses] = useState<WarehouseOccupancy[]>([]);
  const [simpleWarehousesList, setSimpleWarehousesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [stockList, setStockList] = useState<InventoryStock[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros Malla
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterOccupancyStatus, setFilterOccupancyStatus] =
    useState<string>('ALL');

  // Inbound
  const [containerNumber, setContainerNumber] = useState<string>('');
  const [inboundWarehouseId, setInboundWarehouseId] = useState<string>('');
  const [packingList, setPackingList] = useState<PackingListItem[]>([
    {
      productSku: '',
      productName: '',
      quantityBultosExpected: 1,
      weightPerBultoKg: 10,
      lengthCm: 40,
      widthCm: 30,
      heightCm: 30,
      volumePerBultoM3: 0.036,
      category: 'RACK',
      zoneName: 'Rack Principal',
      rackLevel: 'A',
      moduleNumber: 1,
      locationId: '',
    },
  ]);

  // Generador de Rangos y Mantenimiento Masivo
  const [newWhName, setNewWhName] = useState<string>('');
  const [targetConfigWhId, setTargetConfigWhId] = useState<string>('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('ALL'); // Filtro de bloque para mantenimiento

  const [genCategory, setGenCategory] = useState<LocationTypeCategory>('RACK');
  const [genAreaName, setGenAreaName] = useState<string>('Rack Izquierda');
  const [genLevelsInput, setGenLevelsInput] = useState<string>('A, B, C');
  const [genPosStart, setGenPosStart] = useState<number>(1);
  const [genPosEnd, setGenPosEnd] = useState<number>(84);
  const [genCapacityM3, setGenCapacityM3] = useState<number>(2.5);

  // Borrado Masivo
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
      const [whData, whList, stData] = await Promise.all([
        inventoryService.getWarehouseOccupancy(),
        inventoryService.getWarehousesList(),
        inventoryService.getStockList(),
      ]);
      setWarehouses(whData);
      setSimpleWarehousesList(whList);
      setStockList(stData);

      if (whList.length > 0) {
        if (!inboundWarehouseId) setInboundWarehouseId(whList[0].id);
        if (!targetConfigWhId) setTargetConfigWhId(whList[0].id);
      }
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al conectar con el backend.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadLocationsForWarehouse = async (whId: string) => {
    try {
      const locs = await inventoryService.getAvailableLocations(whId);
      setLocations(locs);
      setSelectedLocIdsForDelete([]);
    } catch (err) {
      console.error('Error al cargar ubicaciones:', err);
    }
  };

  // Áreas/Bloques únicos dentro del depósito seleccionado
  const availableAreasInWarehouse = useMemo(() => {
    const areas = new Set<string>();
    locations.forEach((l) => {
      if (l.zoneName) areas.add(l.zoneName);
    });
    return Array.from(areas);
  }, [locations]);

  // Ubicaciones del mantenimiento filtradas por bloque
  const visibleLocationsInMaintenance = useMemo(() => {
    if (selectedAreaFilter === 'ALL') return locations;
    return locations.filter((l) => l.zoneName === selectedAreaFilter);
  }, [locations, selectedAreaFilter]);

  const handleCreateWarehouse = async () => {
    if (!newWhName.trim()) {
      setErrorMsg('Escriba el nombre del depósito.');
      return;
    }
    setSubmitting(true);
    try {
      await inventoryService.createWarehouse({ name: newWhName.trim() });
      setSuccessMsg(`Depósito "${newWhName}" creado con éxito.`);
      setNewWhName('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al crear el depósito.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePackingItem = (
    index: number,
    field: keyof PackingListItem,
    value: any,
  ) => {
    setPackingList((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'lengthCm' || field === 'widthCm' || field === 'heightCm') {
        const l = field === 'lengthCm' ? Number(value) : item.lengthCm;
        const w = field === 'widthCm' ? Number(value) : item.widthCm;
        const h = field === 'heightCm' ? Number(value) : item.heightCm;
        item.volumePerBultoM3 = Number(((l * w * h) / 1000000).toFixed(4));
      }

      if (
        ['category', 'zoneName', 'rackLevel', 'moduleNumber'].includes(field)
      ) {
        const matchingLoc = locations.find((l) => {
          if (item.category === 'RACK') {
            return (
              l.category === 'RACK' &&
              l.rackLevel === item.rackLevel &&
              l.moduleNumber === Number(item.moduleNumber)
            );
          }
          return (
            l.category === item.category &&
            l.zoneName.toLowerCase() === item.zoneName.toLowerCase()
          );
        });
        item.locationId = matchingLoc ? matchingLoc.id : '';
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddPackingItem = () => {
    setPackingList((prev) => [
      ...prev,
      {
        productSku: '',
        productName: '',
        quantityBultosExpected: 1,
        weightPerBultoKg: 10,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 30,
        volumePerBultoM3: 0.036,
        category: 'RACK',
        zoneName: 'Rack Izquierda',
        rackLevel: 'A',
        moduleNumber: 1,
        locationId: '',
      },
    ]);
  };

  const handleConfirmInbound = async () => {
    if (!inboundWarehouseId) {
      setErrorMsg('Debe seleccionar un depósito.');
      return;
    }

    for (let i = 0; i < packingList.length; i++) {
      const item = packingList[i];
      if (!item.productSku || !item.productName) {
        setErrorMsg(`Proporcione SKU y Nombre en la línea #${i + 1}.`);
        return;
      }
      if (!item.locationId) {
        setErrorMsg(
          `La ubicación seleccionada en la línea #${i + 1} no existe en el catálogo.`,
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
        quantityBultos: Number(item.quantityBultosExpected),
        weightPerBultoKg: Number(item.weightPerBultoKg),
        lengthCm: Number(item.lengthCm),
        widthCm: Number(item.widthCm),
        heightCm: Number(item.heightCm),
        volumePerBultoM3: Number(item.volumePerBultoM3),
        locationId: item.locationId!,
      })),
    };

    try {
      await inventoryService.receiveContainer(payload);
      setSuccessMsg('Mercadería estibada correctamente.');
      setContainerNumber('');
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al procesar el ingreso.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (!targetConfigWhId) {
      setErrorMsg('Seleccione un depósito.');
      return;
    }
    const levels = genLevelsInput
      .split(',')
      .map((l) => l.trim().toUpperCase())
      .filter(Boolean);
    if (levels.length === 0) {
      setErrorMsg('Especifique al menos un nivel o letra.');
      return;
    }
    if (genPosStart > genPosEnd) {
      setErrorMsg('La posición inicial no puede ser mayor a la final.');
      return;
    }

    const parsedCapacity = parseFloat(String(genCapacityM3).replace(',', '.'));

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await inventoryService.generateBatchLocations({
        warehouseId: targetConfigWhId,
        category: genCategory,
        areaName: genAreaName.trim(),
        levels,
        positionStart: Number(genPosStart),
        positionEnd: Number(genPosEnd),
        maxCapacityM3PerUnit: isNaN(parsedCapacity) ? 2.5 : parsedCapacity,
      });
      setSuccessMsg('Ubicaciones generadas exitosamente.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Error al generar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelectLocForDelete = (locId: string) => {
    setSelectedLocIdsForDelete((prev) =>
      prev.includes(locId)
        ? prev.filter((id) => id !== locId)
        : [...prev, locId],
    );
  };

  const handleSelectAllLocsForDelete = () => {
    const visibleIds = visibleLocationsInMaintenance.map((l) => l.id);
    const allSelected = visibleIds.every((id) =>
      selectedLocIdsForDelete.includes(id),
    );

    if (allSelected) {
      setSelectedLocIdsForDelete((prev) =>
        prev.filter((id) => !visibleIds.includes(id)),
      );
    } else {
      setSelectedLocIdsForDelete((prev) =>
        Array.from(new Set([...prev, ...visibleIds])),
      );
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
        err.response?.data?.message ||
          'No se pueden eliminar posiciones con stock.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (selectedAreaFilter === 'ALL') return;
    const locsInBlock = locations
      .filter((l) => l.zoneName === selectedAreaFilter)
      .map((l) => l.id);
    if (locsInBlock.length === 0) return;

    if (
      !confirm(
        `⚠️ ¿Confirma eliminar COMPLETAMENTE el bloque/área "${selectedAreaFilter}" (${locsInBlock.length} ubicaciones)?`,
      )
    )
      return;

    setSubmitting(true);
    try {
      await inventoryService.deleteLocationsBatch(locsInBlock);
      setSuccessMsg(`Bloque "${selectedAreaFilter}" eliminado correctamente.`);
      setSelectedAreaFilter('ALL');
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message ||
          'No se puede eliminar el bloque porque contiene posiciones con stock activo.',
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
        `⚠️ ¿ATENCIÓN: Confirma eliminar el depósito "${wh?.name}" y TODAS sus ubicaciones?`,
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

  const handleResetAllData = async () => {
    if (
      !confirm(
        '🚨 ¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nEsta acción eliminará TODOS los depósitos, TODAS las ubicaciones y TODO el stock registrado para reiniciar de cero.',
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await inventoryService.clearAllData();
      setSuccessMsg('Inventario reseteado por completo.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Error al resetear los datos.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredWarehouses = warehouses.filter((wh) =>
    filterWarehouseId === 'ALL' ? true : wh.id === filterWarehouseId,
  );

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER']}>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 font-sans">
        <div className="flex flex-wrap justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-wide">
              Gestión de Inventario & Ocupación Física
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Control dinámico de depósitos, racks, pasillos y techos con
              alertas de sobrecapacidad
            </p>
          </div>

          <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
            <button
              onClick={() => setActiveTab('MALLA')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'MALLA'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📊 Malla de Ocupación
            </button>
            <button
              onClick={() => setActiveTab('INBOUND')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'INBOUND'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🚢 Ingreso Contenedor
            </button>
            <button
              onClick={() => setActiveTab('STOCK')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'STOCK'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📦 Stock & Mover
            </button>
            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'CONFIG'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚙️ Depósitos & Ubicaciones
            </button>
          </div>
        </div>

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
              Cargando malla de ocupación...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'MALLA' && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">
                        Filtrar Depósito
                      </label>
                      <select
                        value={filterWarehouseId}
                        onChange={(e) => setFilterWarehouseId(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="ALL">Todos los Depósitos</option>
                        {simpleWarehousesList.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">
                        Tipo de Área
                      </label>
                      <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="ALL">Todas las Áreas</option>
                        <option value="RACK">Racks</option>
                        <option value="PASILLO">Pasillos</option>
                        <option value="TECHO">Techos</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold mb-1">
                        Estado Ocupación
                      </label>
                      <select
                        value={filterOccupancyStatus}
                        onChange={(e) =>
                          setFilterOccupancyStatus(e.target.value)
                        }
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="ALL">Todos los Estados</option>
                        <option value="VACIO">Vacíos (0%)</option>
                        <option value="PARCIAL">Parcial (1% - 89%)</option>
                        <option value="COMPLETO">Llenos (90% - 100%)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {filteredWarehouses.map((wh) => {
                  const locs = wh.locations.filter((l) => {
                    const matchCategory =
                      filterCategory === 'ALL' || l.category === filterCategory;
                    let matchStatus = true;
                    if (filterOccupancyStatus === 'VACIO')
                      matchStatus = l.occupancyPercentage === 0;
                    if (filterOccupancyStatus === 'PARCIAL')
                      matchStatus =
                        l.occupancyPercentage > 0 && l.occupancyPercentage < 90;
                    if (filterOccupancyStatus === 'COMPLETO')
                      matchStatus = l.occupancyPercentage >= 90;

                    return matchCategory && matchStatus;
                  });

                  return (
                    <div
                      key={wh.id}
                      className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl"
                    >
                      <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-extrabold text-amber-400">
                              🏬 {wh.name}
                            </h2>
                            {wh.isOverloaded && (
                              <span className="bg-red-950 text-red-400 border border-red-800 px-2.5 py-0.5 rounded-full text-[10px] font-black animate-pulse">
                                ⚠️ SOBREEXIGIDO (&gt;100%)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            Capacidad: {wh.usedCapacityM3} m³ /{' '}
                            {wh.totalCapacityM3} m³ (
                            <strong
                              className={
                                wh.isOverloaded
                                  ? 'text-red-400 font-black'
                                  : 'text-amber-400'
                              }
                            >
                              {wh.occupancyPercentage}%
                            </strong>
                            )
                          </p>
                        </div>
                        <span className="text-xs bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-slate-300 font-bold">
                          {locs.length} Ubicaciones
                        </span>
                      </div>

                      <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 mb-4">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            wh.isOverloaded ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                          style={{
                            width: `${Math.min(100, wh.occupancyPercentage)}%`,
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {locs.map((loc) => (
                          <div
                            key={loc.id}
                            className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                              loc.occupancyPercentage >= 90
                                ? 'bg-red-950/20 border-red-500/40'
                                : loc.occupancyPercentage > 0
                                  ? 'bg-amber-950/20 border-amber-500/40'
                                  : 'bg-emerald-950/20 border-emerald-500/40'
                            }`}
                          >
                            <div>
                              <span className="font-black text-white block">
                                {loc.code}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {loc.zoneName}
                              </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center">
                              <span className="font-bold text-amber-400">
                                {loc.occupancyPercentage}%
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {loc.usedCapacityM3} m³
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'INBOUND' && (
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-6">
                <h2 className="text-lg font-bold text-amber-400">
                  Ingreso de Mercadería & Selector Inteligente
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Contenedor / Remito
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
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Depósito Descarga *
                    </label>
                    <select
                      value={inboundWarehouseId}
                      onChange={(e) => {
                        setInboundWarehouseId(e.target.value);
                        loadLocationsForWarehouse(e.target.value);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    >
                      {simpleWarehousesList.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {packingList.map((item, index) => (
                    <div
                      key={index}
                      className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1">
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
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-slate-400 mb-1">
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
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1">
                            Bultos Reales
                          </label>
                          <input
                            type="number"
                            value={item.quantityBultosExpected}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'quantityBultosExpected',
                                Number(e.target.value),
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-amber-400 font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div>
                          <label className="block text-slate-400 mb-1">
                            1. Área
                          </label>
                          <select
                            value={item.category}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                index,
                                'category',
                                e.target.value,
                              )
                            }
                            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white"
                          >
                            <option value="RACK">Rack</option>
                            <option value="PASILLO">Pasillo</option>
                            <option value="TECHO">Techo</option>
                          </select>
                        </div>

                        {item.category === 'RACK' ? (
                          <>
                            <div>
                              <label className="block text-slate-400 mb-1">
                                2. Nivel
                              </label>
                              <select
                                value={item.rackLevel}
                                onChange={(e) =>
                                  handleUpdatePackingItem(
                                    index,
                                    'rackLevel',
                                    e.target.value,
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                              >
                                <option value="A">Nivel A</option>
                                <option value="B">Nivel B</option>
                                <option value="C">Nivel C</option>
                                <option value="D">Nivel D</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-slate-400 mb-1">
                                3. Módulo (1 a 84)
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="84"
                                value={item.moduleNumber}
                                onChange={(e) =>
                                  handleUpdatePackingItem(
                                    index,
                                    'moduleNumber',
                                    Number(e.target.value),
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="sm:col-span-2">
                            <label className="block text-slate-400 mb-1">
                              2. Nombre Área / Pasillo
                            </label>
                            <input
                              type="text"
                              value={item.zoneName}
                              onChange={(e) =>
                                handleUpdatePackingItem(
                                  index,
                                  'zoneName',
                                  e.target.value,
                                )
                              }
                              placeholder="Ej. Pasillo 1, Techo Oficina..."
                              className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-slate-400 mb-1">
                            Estado Posición
                          </label>
                          <span
                            className={`block p-2 rounded text-center font-bold ${
                              item.locationId
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-red-950 text-red-400 border border-red-800'
                            }`}
                          >
                            {item.locationId ? '✓ Encontrada' : '✕ No Existe'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={handleAddPackingItem}
                    className="px-3 py-1.5 bg-slate-800 text-amber-400 font-bold rounded text-xs"
                  >
                    + Agregar Otro Ítem
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={handleConfirmInbound}
                    disabled={submitting}
                    className="px-6 py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-sm"
                  >
                    {submitting
                      ? 'Procesando...'
                      : '📥 CONFIRMAR INGRESO & ESTIBAR'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'CONFIG' && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2 mb-4">
                    🏬 Alta Nuevo Depósito
                  </h2>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newWhName}
                      onChange={(e) => setNewWhName(e.target.value)}
                      placeholder="Nombre del Depósito (Ej. Chile 1, Murguiondo, Armenia...)"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    />
                    <button
                      onClick={handleCreateWarehouse}
                      disabled={submitting}
                      className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs font-bold"
                    >
                      + CREAR DEPÓSITO
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* GENERADOR DE RANGOS */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
                    <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                      ⚡ Generador Inteligente por Rangos
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
                          Tipo de Estructura
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
                          Capacidad m³ por Posición
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
                        Nombre del Área / Rack / Pasillo
                      </label>
                      <input
                        type="text"
                        value={genAreaName}
                        onChange={(e) => setGenAreaName(e.target.value)}
                        placeholder="Ej. Rack Izquierda, Pasillo Devoluciones..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">
                          Niveles / Letras (Comas)
                        </label>
                        <input
                          type="text"
                          value={genLevelsInput}
                          onChange={(e) => setGenLevelsInput(e.target.value)}
                          placeholder="Ej. A, B, C"
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">
                          Rango Numérico (Desde - Hasta)
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
                      className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg"
                    >
                      ⚡ GENERAR LOTE DE UBICACIONES
                    </button>
                  </div>

                  {/* BLOQUE DE MANTENIMIENTO MASIVO REDISEÑADO */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h2 className="text-base font-bold text-amber-400">
                          🗑️ Mantenimiento Masivo
                        </h2>
                        <button
                          onClick={handleDeleteFullWarehouse}
                          className="px-2.5 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[11px] font-bold transition-all"
                        >
                          ⚠️ Borrar Depósito Completo
                        </button>
                      </div>

                      {/* PASO 1 & PASO 2: SELECCIÓN DE DEPÓSITO Y BLOQUE */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1 font-bold">
                            1. Depósito Seleccionado
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
                            2. Bloque / Área Específica
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

                      {/* BOTÓN PARA BORRAR TODO EL BLOQUE FILTRADO */}
                      {selectedAreaFilter !== 'ALL' && (
                        <div className="flex justify-end">
                          <button
                            onClick={handleDeleteBlock}
                            disabled={submitting}
                            className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 font-bold rounded-lg border border-red-800 text-xs transition-all"
                          >
                            🔥 Eliminar Bloque "{selectedAreaFilter}" Completo
                          </button>
                        </div>
                      )}

                      {/* CABECERA Y SELECCIÓN EN LOTE */}
                      <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                        <button
                          onClick={handleSelectAllLocsForDelete}
                          className="text-amber-400 font-bold hover:underline"
                        >
                          {visibleLocationsInMaintenance.length > 0 &&
                          visibleLocationsInMaintenance.every((l) =>
                            selectedLocIdsForDelete.includes(l.id),
                          )
                            ? 'Desmarcar Visibles'
                            : 'Seleccionar Visibles'}
                        </button>
                        <span className="text-slate-400 font-medium">
                          {selectedLocIdsForDelete.length} Seleccionadas
                        </span>
                      </div>

                      {/* LISTA FILTRADA DE UBICACIONES */}
                      <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                        {visibleLocationsInMaintenance.length === 0 ? (
                          <div className="p-6 text-center text-slate-500 text-xs italic bg-slate-950/50 rounded-xl border border-slate-800">
                            No hay ubicaciones físicas registradas en este
                            bloque.
                          </div>
                        ) : (
                          visibleLocationsInMaintenance.map((loc) => {
                            const isSelected = selectedLocIdsForDelete.includes(
                              loc.id,
                            );

                            return (
                              <div
                                key={loc.id}
                                onClick={() => toggleSelectLocForDelete(loc.id)}
                                className={`cursor-pointer p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                                  isSelected
                                    ? 'bg-red-950/30 border-red-500'
                                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
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
                                      {loc.zoneName} ({loc.maxCapacityM3} m³)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* ACCIONES INFERIORES */}
                    <div className="space-y-2 pt-3 border-t border-slate-800">
                      {selectedLocIdsForDelete.length > 0 && (
                        <button
                          onClick={handleDeleteSelectedLocations}
                          disabled={submitting}
                          className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-xs shadow-lg transition-all"
                        >
                          🗑️ ELIMINAR {selectedLocIdsForDelete.length}{' '}
                          UBICACIONES SELECCIONADAS
                        </button>
                      )}

                      <button
                        onClick={handleResetAllData}
                        disabled={submitting}
                        className="w-full py-2 bg-red-950/60 hover:bg-red-950 text-red-400 font-bold rounded-xl text-xs border border-red-900 transition-all"
                      >
                        🔥 VACIAR TODO Y REINICIAR DESDE CERO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
