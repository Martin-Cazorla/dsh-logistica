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

  // Malla Ocupación: Selección de Depósito y Filtros Progresivos
  const [selectedMallaWarehouseId, setSelectedMallaWarehouseId] = useState<
    string | null
  >(null);
  const [mallaZoneFilter, setMallaZoneFilter] = useState<string>('ALL');
  const [mallaCodeSearch, setMallaCodeSearch] = useState<string>('');

  // Pre-carga Inbound (Fase 1)
  const [containerNumber, setContainerNumber] = useState<string>('');
  const [packingList, setPackingList] = useState<PackingListItem[]>([
    {
      productSku: '',
      productName: '',
      quantityBultosExpected: 1,
      totalUnitsExpected: 1,
      unitsPerBox: 1,
      weightPerBultoKg: 10,
      lengthCm: 40,
      widthCm: 30,
      heightCm: 30,
      volumePerBultoM3: 0.036,
      sampleUnits: 0,
      notes: '',
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
  const [dischargeWarehouseId, setDischargeWarehouseId] = useState<string>('');
  const [generalEntryDate, setGeneralEntryDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [physicalControlItems, setPhysicalControlItems] = useState<any[]>([]);

  // Filtros y Acordeón para Fase 2 (Control Móvil)
  const [phase2SearchTerm, setPhase2SearchTerm] = useState<string>('');
  const [phase2Tab, setPhase2Tab] = useState<'PENDIENTES' | 'CONTROLADOS'>(
    'PENDIENTES',
  );
  const [expandedItemSkus, setExpandedItemSkus] = useState<string[]>([]);

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
    if (dischargeWarehouseId) {
      loadLocationsForWarehouse(dischargeWarehouseId);
    }
  }, [dischargeWarehouseId]);

  useEffect(() => {
    if (targetConfigWhId) {
      loadLocationsForWarehouse(targetConfigWhId);
      setSelectedAreaFilter('ALL');
    }
  }, [targetConfigWhId]);

  useEffect(() => {
    if (selectedPendingContainerId) {
      const container = containersHistory.find(
        (c) => c.id === selectedPendingContainerId,
      );
      if (container) {
        if (container.warehouseId) {
          setDischargeWarehouseId(container.warehouseId);
        } else if (simpleWarehousesList.length > 0) {
          setDischargeWarehouseId(simpleWarehousesList[0].id);
        }

        if (container.items) {
          const defaultLoc = locations[0]?.id || '';
          setPhysicalControlItems(
            container.items.map((i: any) => {
              const qtyBultos =
                i.quantityBultos || i.quantityBultosExpected || 1;
              return {
                ...i,
                sku: i.sku || i.productSku || '',
                description: i.description || i.productName || '',
                quantityBultos: qtyBultos,
                unitsPerBox: i.unitsPerBox || 1,
                lengthCm: i.lengthCm || 40,
                widthCm: i.widthCm || 30,
                heightCm: i.heightCm || 30,
                weightPerBultoKg: i.weightPerBultoKg || 10,
                volumePerBultoM3: i.volumePerBultoM3 || 0.036,
                hasShowroomSample: false,
                sampleUnitsCount: 0,
                isChecked: false, // Control de revisión individual
                pallets: [
                  {
                    palletIndex: 1,
                    quantityBultos: qtyBultos,
                    locationId: defaultLoc,
                  },
                ],
              };
            }),
          );
          setExpandedItemSkus([]);
        }
      }
    } else {
      setPhysicalControlItems([]);
      setExpandedItemSkus([]);
    }
  }, [
    selectedPendingContainerId,
    containersHistory,
    locations,
    simpleWarehousesList,
  ]);

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
          !dischargeWarehouseId ||
          !whList.some((w: { id: string }) => w.id === dischargeWarehouseId)
        ) {
          setDischargeWarehouseId(whList[0].id);
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

  // Selección de Depósito Activo para Malla Ocupación
  const selectedMallaWarehouse = useMemo(() => {
    if (!selectedMallaWarehouseId) return null;
    return warehouses.find((w) => w.id === selectedMallaWarehouseId) || null;
  }, [warehouses, selectedMallaWarehouseId]);

  // Zonas / Racks Disponibles en el Depósito Seleccionado
  const availableMallaZones = useMemo(() => {
    if (!selectedMallaWarehouse) return [];
    const zones = new Set<string>();
    selectedMallaWarehouse.locations.forEach((loc) => {
      if (loc.zoneName) zones.add(loc.zoneName);
    });
    return Array.from(zones);
  }, [selectedMallaWarehouse]);

  // Posiciones Filtradas para el Depósito Seleccionado
  const filteredMallaLocations = useMemo(() => {
    if (!selectedMallaWarehouse) return [];
    return selectedMallaWarehouse.locations.filter((loc) => {
      const matchesZone =
        mallaZoneFilter === 'ALL' || loc.zoneName === mallaZoneFilter;
      const matchesSearch =
        !mallaCodeSearch.trim() ||
        loc.code.toLowerCase().includes(mallaCodeSearch.toLowerCase().trim());
      return matchesZone && matchesSearch;
    });
  }, [selectedMallaWarehouse, mallaZoneFilter, mallaCodeSearch]);

  // Filtro de Productos para Fase 2 (Pendientes / Controlados y Buscador)
  const filteredPhysicalControlItems = useMemo(() => {
    return physicalControlItems.filter((item) => {
      const isChecked = Boolean(item.isChecked);
      const matchesTab = phase2Tab === 'PENDIENTES' ? !isChecked : isChecked;

      const query = phase2SearchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.sku.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchesTab && matchesSearch;
    });
  }, [physicalControlItems, phase2Tab, phase2SearchTerm]);

  // Manejo de la expansión individual de acordeón
  const toggleItemAccordion = (sku: string) => {
    setExpandedItemSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku],
    );
  };

  // Manejo de la tabla dinámica en Fase 1 (Packing List)
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

  const handleAddPackingItem = () => {
    setPackingList((prev) => [
      ...prev,
      {
        productSku: '',
        productName: '',
        quantityBultosExpected: 1,
        totalUnitsExpected: 1,
        unitsPerBox: 1,
        weightPerBultoKg: 10,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 30,
        volumePerBultoM3: 0.036,
        sampleUnits: 0,
        notes: '',
        entryDate: new Date().toISOString().split('T')[0],
        category: 'RACK',
        zoneName: 'Rack Izquierda',
        rackLevel: 'A',
        moduleNumber: 1,
        locationId: locations[0]?.id || '',
      },
    ]);
  };

  const handleRemovePackingItem = (index: number) => {
    if (packingList.length === 1) return;
    setPackingList((prev) => prev.filter((_, i) => i !== index));
  };

  // Manejo de la tabla en Fase 2 (Control Físico General)
  const handleUpdatePhysicalItem = (
    itemIdx: number,
    field: string,
    value: any,
  ) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx], [field]: value };

      if (field === 'lengthCm' || field === 'widthCm' || field === 'heightCm') {
        const l = field === 'lengthCm' ? Number(value) : item.lengthCm;
        const w = field === 'widthCm' ? Number(value) : item.widthCm;
        const h = field === 'heightCm' ? Number(value) : item.heightCm;
        item.volumePerBultoM3 = Number(((l * w * h) / 1000000).toFixed(4));
      }

      updated[itemIdx] = item;
      return updated;
    });
  };

  // Cambiar estado de control de un producto (Pendiente <-> Controlado)
  const toggleItemControlStatus = (itemIdx: number) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const current = updated[itemIdx];
      updated[itemIdx] = { ...current, isChecked: !current.isChecked };
      return updated;
    });
  };

  // Manejo de Pallets Dinámicos por Producto
  const handleAddPalletToItem = (itemIdx: number) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      const currentPallets = item.pallets || [];
      const defaultLoc = locations[0]?.id || '';

      const allocatedBultos = currentPallets.reduce(
        (acc: number, p: any) => acc + (Number(p.quantityBultos) || 0),
        0,
      );
      const remainingBultos = Math.max(
        0,
        item.quantityBultos - allocatedBultos,
      );

      item.pallets = [
        ...currentPallets,
        {
          palletIndex: currentPallets.length + 1,
          quantityBultos: remainingBultos > 0 ? remainingBultos : 1,
          locationId: defaultLoc,
        },
      ];
      updated[itemIdx] = item;
      return updated;
    });
  };

  const handleRemovePalletFromItem = (itemIdx: number, palletIdx: number) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      if (item.pallets.length <= 1) return prev;
      item.pallets = item.pallets
        .filter((_: any, pIdx: number) => pIdx !== palletIdx)
        .map((p: any, idx: number) => ({ ...p, palletIndex: idx + 1 }));
      updated[itemIdx] = item;
      return updated;
    });
  };

  const handleUpdatePalletItem = (
    itemIdx: number,
    palletIdx: number,
    field: string,
    value: any,
  ) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      const pallets = [...item.pallets];
      pallets[palletIdx] = { ...pallets[palletIdx], [field]: value };
      item.pallets = pallets;
      updated[itemIdx] = item;
      return updated;
    });
  };

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

    const defaultWhId = simpleWarehousesList[0]?.id;
    if (!defaultWhId) {
      setErrorMsg('No se encontró un depósito disponible en el sistema.');
      return;
    }

    const fallbackLocationId = locations[0]?.id;

    for (let i = 0; i < packingList.length; i++) {
      if (!packingList[i].productSku || !packingList[i].productName) {
        setErrorMsg(`Indique Código SKU y Descripción en la línea #${i + 1}.`);
        return;
      }
      const effectiveLoc =
        packingList[i].locationId?.trim() || fallbackLocationId;
      if (!effectiveLoc) {
        setErrorMsg(
          `La línea #${i + 1} requiere una ubicación válida y no hay ubicaciones cargadas.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        containerNumber: containerNumber.trim(),
        warehouseId: defaultWhId,
        items: packingList.map((item) => {
          const validLocId = item.locationId?.trim() || fallbackLocationId;
          return {
            productSku: item.productSku,
            productName: item.productName,
            quantityBultos: Number(item.quantityBultosExpected) || 1,
            unitsPerBox: Number(item.unitsPerBox) || 1,
            weightPerBultoKg: Number(item.weightPerBultoKg) || 10,
            volumePerBultoM3: Number(item.volumePerBultoM3) || 0.036,
            sampleUnits: Number(item.sampleUnits) || 0,
            notes: item.notes || '',
            locationId: validLocId,
          };
        }),
      };

      await inventoryService.createPackingList(payload);

      setSuccessMsg(
        `Packing List para contenedor "${containerNumber}" pre-cargado con éxito.`,
      );

      setContainerNumber('');
      setPackingList([
        {
          productSku: '',
          productName: '',
          quantityBultosExpected: 1,
          totalUnitsExpected: 1,
          unitsPerBox: 1,
          weightPerBultoKg: 10,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 30,
          volumePerBultoM3: 0.036,
          sampleUnits: 0,
          notes: '',
          entryDate: new Date().toISOString().split('T')[0],
          category: 'RACK',
          zoneName: 'Rack Izquierda',
          rackLevel: 'A',
          moduleNumber: 1,
          locationId: locations[0]?.id || '',
        },
      ]);

      await loadData();
    } catch (err: any) {
      const backendMessage = err.response?.data?.message;
      if (Array.isArray(backendMessage)) {
        setErrorMsg(backendMessage.join(' | '));
      } else {
        setErrorMsg(backendMessage || 'Error al pre-cargar el Packing List.');
      }
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

    if (!dischargeWarehouseId) {
      setErrorMsg('Seleccione un depósito de descarga.');
      return;
    }

    const selectedCont = pendingContainers.find(
      (c) => c.id === selectedPendingContainerId,
    );
    if (!selectedCont) return;

    const itemsToSubmit: any[] = [];
    const defaultLocId = locations[0]?.id;

    for (const item of physicalControlItems) {
      const pallets = item.pallets || [];
      const sumPalletBultos = pallets.reduce(
        (acc: number, p: any) => acc + (Number(p.quantityBultos) || 0),
        0,
      );

      if (sumPalletBultos !== item.quantityBultos) {
        setErrorMsg(
          `Atención: Para el SKU ${item.sku}, la suma de bultos por pallet (${sumPalletBultos}) no coincide con el total de bultos del producto (${item.quantityBultos}).`,
        );
        return;
      }

      for (const pallet of pallets) {
        const validLocId = pallet.locationId?.trim() || defaultLocId;
        if (!validLocId) {
          setErrorMsg(
            `Seleccione una ubicación válida para el pallet del SKU ${item.sku}.`,
          );
          return;
        }

        itemsToSubmit.push({
          sku: item.sku,
          description: item.description,
          quantityBultos: Number(pallet.quantityBultos) || 1,
          unitsPerBox: Number(item.unitsPerBox) || 1,
          weightPerBultoKg: Number(item.weightPerBultoKg) || 10,
          volumePerBultoM3: Number(item.volumePerBultoM3) || 0.036,
          sampleUnits: item.hasShowroomSample
            ? Number(item.sampleUnitsCount) || 0
            : 0,
          entryDate: generalEntryDate,
          locationId: validLocId,
          warehouseId: dischargeWarehouseId,
        });
      }
    }

    setSubmitting(true);
    try {
      await inventoryService.processInbound(
        selectedPendingContainerId,
        itemsToSubmit,
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

  const handleSelectAllVisibleLocations = () => {
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
        `Confirma eliminar las ${selectedLocIdsForDelete.length} ubicaciones seleccionadas?`,
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

  const pendingCount = physicalControlItems.filter((i) => !i.isChecked).length;
  const checkedCount = physicalControlItems.filter((i) => i.isChecked).length;

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
            {/* TAB: MALLA OCUPACIÓN CON DASHBOARD Y DESGLOSE DINÁMICO */}
            {activeTab === 'MALLA' && (
              <div className="space-y-6">
                {!selectedMallaWarehouse ? (
                  // VISTA 1: TARJETAS EJECUTIVAS DE DEPÓSITOS (% OCUPACIÓN)
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {warehouses.map((wh) => {
                      const totalM3 = Number(wh.totalCapacityM3) || 1;
                      const usedM3 = Number(wh.usedCapacityM3) || 0;
                      const percentage = Math.min(
                        100,
                        Math.round((usedM3 / totalM3) * 100),
                      );

                      return (
                        <div
                          key={wh.id}
                          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-amber-500/50 transition-all cursor-pointer"
                          onClick={() => setSelectedMallaWarehouseId(wh.id)}
                        >
                          <div>
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h2 className="text-lg font-black text-amber-400">
                                  {wh.name}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">
                                  {wh.locations.length} Posiciones Totales
                                </p>
                              </div>
                              <span className="text-xs font-mono font-bold bg-slate-950 border border-slate-800 px-3 py-1 rounded-full text-slate-300">
                                {usedM3} / {totalM3} m³
                              </span>
                            </div>

                            <div className="space-y-2 my-4">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-400">
                                  Nivel de Ocupación
                                </span>
                                <span
                                  className={
                                    percentage > 85
                                      ? 'text-red-400'
                                      : percentage > 60
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                  }
                                >
                                  {percentage}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    percentage > 85
                                      ? 'bg-red-500'
                                      : percentage > 60
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>

                          <button className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs mt-2 transition-colors flex items-center justify-center gap-2">
                            <span>Ver Mapa de Posiciones</span>
                            <span>→</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // VISTA 2: DESGLOSE FILTRADO DEL DEPÓSITO SELECCIONADO
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
                    <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <button
                          onClick={() => {
                            setSelectedMallaWarehouseId(null);
                            setMallaZoneFilter('ALL');
                            setMallaCodeSearch('');
                          }}
                          className="text-xs text-amber-400 font-bold hover:underline mb-1 block"
                        >
                          ← Volver a Resumen de Depósitos
                        </button>
                        <h2 className="text-xl font-black text-amber-400">
                          Depósito: {selectedMallaWarehouse.name}
                        </h2>
                        <p className="text-xs text-slate-400">
                          Ocupación: {selectedMallaWarehouse.usedCapacityM3} m³
                          / {selectedMallaWarehouse.totalCapacityM3} m³ |{' '}
                          {filteredMallaLocations.length} posiciones visibles
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 items-center">
                        <div>
                          <input
                            type="text"
                            placeholder="Buscar posición (Ej. A21)..."
                            value={mallaCodeSearch}
                            onChange={(e) => setMallaCodeSearch(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono"
                          />
                        </div>

                        <div>
                          <select
                            value={mallaZoneFilter}
                            onChange={(e) => setMallaZoneFilter(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                          >
                            <option value="ALL">Todas las Áreas / Racks</option>
                            {availableMallaZones.map((zone) => (
                              <option key={zone} value={zone}>
                                {zone}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {filteredMallaLocations.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        No se encontraron posiciones con los filtros aplicados.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[550px] overflow-y-auto pr-1">
                        {filteredMallaLocations.map((loc) => (
                          <div
                            key={loc.id}
                            className="p-3 rounded-xl border bg-slate-950 border-slate-800 text-xs hover:border-slate-700 transition-colors"
                          >
                            <span className="font-black text-white block truncate">
                              {loc.code}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {loc.zoneName} ({loc.maxCapacityM3} m³)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'INBOUND' && (
              <div className="space-y-6">
                {/* FASE 1: PRE-CARGA DE PACKING LIST */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 1: Pre-carga de Contenedores / Packing List
                  </h2>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Número de Contenedor / Remito *
                    </label>
                    <input
                      type="text"
                      value={containerNumber}
                      onChange={(e) => setContainerNumber(e.target.value)}
                      placeholder="Ej. MSCU-984021-3"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-300">
                        Detalle de Ítems del Packing List
                      </span>
                      <button
                        onClick={handleAddPackingItem}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-xs"
                      >
                        + Agregar Producto
                      </button>
                    </div>

                    {packingList.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end"
                      >
                        <div className="sm:col-span-3">
                          <label className="block text-slate-400 mb-1">
                            Código SKU *
                          </label>
                          <input
                            type="text"
                            value={item.productSku}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                idx,
                                'productSku',
                                e.target.value,
                              )
                            }
                            placeholder="Ej. US26615"
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-white font-mono"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-slate-400 mb-1">
                            Descripción / Producto *
                          </label>
                          <input
                            type="text"
                            value={item.productName}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                idx,
                                'productName',
                                e.target.value,
                              )
                            }
                            placeholder="Ej. Casco de bicicleta"
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-slate-400 mb-1">
                            Total Bultos
                          </label>
                          <input
                            type="number"
                            value={item.quantityBultosExpected}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                idx,
                                'quantityBultosExpected',
                                Number(e.target.value),
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-amber-400 font-bold text-center"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-slate-400 mb-1">
                            Total Unidades
                          </label>
                          <input
                            type="number"
                            value={item.totalUnitsExpected}
                            onChange={(e) =>
                              handleUpdatePackingItem(
                                idx,
                                'totalUnitsExpected',
                                Number(e.target.value),
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-800 p-2 rounded text-amber-400 font-bold text-center"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          {packingList.length > 1 && (
                            <button
                              onClick={() => handleRemovePackingItem(idx)}
                              className="px-2 py-2 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded font-bold w-full text-center"
                            >
                              X
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSavePackingList}
                    disabled={submitting}
                    className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg hover:bg-amber-400 transition-colors"
                  >
                    PRE-CARGAR PACKING LIST EN BASE DE DATOS
                  </button>
                </div>

                {/* FASE 2: CONTROL MÓVIL OPTIMIZADO */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-5">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 2: Control Móvil y Descarga Físico-Estibado
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                            {c.containerNumber} ({c.totalBultos} bultos)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Depósito de Descarga *
                      </label>
                      <select
                        value={dischargeWarehouseId}
                        onChange={(e) =>
                          setDischargeWarehouseId(e.target.value)
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      >
                        {simpleWarehousesList.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">
                        Fecha de Ingreso / Descarga *
                      </label>
                      <input
                        type="date"
                        value={generalEntryDate}
                        onChange={(e) => setGeneralEntryDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      />
                    </div>
                  </div>

                  {selectedPendingContainerId &&
                    physicalControlItems.length > 0 && (
                      <div className="space-y-4 pt-2">
                        {/* FILTROS Y BÚSQUEDA RÁPIDA EN FASE 2 */}
                        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                          {/* PESTAÑAS PENDIENTES / CONTROLADOS */}
                          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 gap-1">
                            <button
                              onClick={() => setPhase2Tab('PENDIENTES')}
                              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                                phase2Tab === 'PENDIENTES'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Pendientes de Control ({pendingCount})
                            </button>
                            <button
                              onClick={() => setPhase2Tab('CONTROLADOS')}
                              className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                                phase2Tab === 'CONTROLADOS'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Controlados ({checkedCount})
                            </button>
                          </div>

                          {/* BUSCADOR POR SKU O DESCRIPCIÓN */}
                          <div className="flex-1 min-w-[200px]">
                            <input
                              type="text"
                              placeholder="🔍 Buscar por SKU o Descripción..."
                              value={phase2SearchTerm}
                              onChange={(e) =>
                                setPhase2SearchTerm(e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 font-bold focus:border-amber-500 outline-none"
                            />
                          </div>
                        </div>

                        {/* LISTADO DE PRODUCTOS CON MODO ACCORDEÓN COMPACTO */}
                        {filteredPhysicalControlItems.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">
                            No hay productos en esta sección con los filtros
                            actuales.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {filteredPhysicalControlItems.map((item) => {
                              const realIdx = physicalControlItems.findIndex(
                                (i) => i.sku === item.sku,
                              );
                              const isExpanded = expandedItemSkus.includes(
                                item.sku,
                              );

                              const totalPalletBultos = (
                                item.pallets || []
                              ).reduce(
                                (acc: number, p: any) =>
                                  acc + (Number(p.quantityBultos) || 0),
                                0,
                              );
                              const isBultosMatched =
                                totalPalletBultos === item.quantityBultos;

                              return (
                                <div
                                  key={item.sku}
                                  className={`bg-slate-950 border rounded-xl transition-all ${
                                    item.isChecked
                                      ? 'border-emerald-500/50'
                                      : isExpanded
                                        ? 'border-amber-500/70 shadow-lg'
                                        : 'border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  {/* HEADER COMPACTO CON INFORMACIÓN MÍNIMA */}
                                  <div
                                    onClick={() =>
                                      toggleItemAccordion(item.sku)
                                    }
                                    className="p-3.5 flex flex-wrap justify-between items-center cursor-pointer gap-2 select-none"
                                  >
                                    <div>
                                      <h4 className="font-black text-white text-sm tracking-wide">
                                        SKU:{' '}
                                        <span className="text-amber-400 font-mono">
                                          {item.sku}
                                        </span>{' '}
                                        - {item.description}
                                      </h4>
                                      <div className="text-xs text-slate-400 mt-1">
                                        Total bultos producto:{' '}
                                        <strong className="text-amber-400">
                                          {item.quantityBultos}
                                        </strong>{' '}
                                        | Asignados en Pallets:{' '}
                                        <strong
                                          className={
                                            isBultosMatched
                                              ? 'text-emerald-400'
                                              : 'text-red-400'
                                          }
                                        >
                                          {totalPalletBultos}
                                        </strong>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      {/* BOTÓN PARA MARCAR COMO REVISADO/CONTROLADO */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleItemControlStatus(realIdx);
                                        }}
                                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                                          item.isChecked
                                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                        }`}
                                      >
                                        {item.isChecked
                                          ? '✓ Controlado'
                                          : 'Marcar Controlado'}
                                      </button>

                                      <span className="text-amber-400 font-bold text-xs">
                                        {isExpanded ? '▲ Ocultar' : '▼ Editar'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* DESPLIEGUE FLUIDO DE ACCIONES DE CARGA Y ESTIBADO */}
                                  {isExpanded && (
                                    <div className="p-4 border-t border-slate-800 space-y-4 text-xs bg-slate-900/40 rounded-b-xl">
                                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-900 p-3 rounded-lg border border-slate-800">
                                        <div>
                                          <label className="block text-slate-400 mb-1">
                                            Foto del Bulto
                                          </label>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="w-full text-slate-400 text-[10px]"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-slate-400 mb-1">
                                            Unidades por Bulto
                                          </label>
                                          <input
                                            type="number"
                                            value={item.unitsPerBox}
                                            onChange={(e) =>
                                              handleUpdatePhysicalItem(
                                                realIdx,
                                                'unitsPerBox',
                                                Number(e.target.value),
                                              )
                                            }
                                            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-slate-400 mb-1">
                                            Medidas (L x A x H cm)
                                          </label>
                                          <div className="flex gap-1">
                                            <input
                                              type="number"
                                              value={item.lengthCm}
                                              onChange={(e) =>
                                                handleUpdatePhysicalItem(
                                                  realIdx,
                                                  'lengthCm',
                                                  Number(e.target.value),
                                                )
                                              }
                                              className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center"
                                            />
                                            <input
                                              type="number"
                                              value={item.widthCm}
                                              onChange={(e) =>
                                                handleUpdatePhysicalItem(
                                                  realIdx,
                                                  'widthCm',
                                                  Number(e.target.value),
                                                )
                                              }
                                              className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center"
                                            />
                                            <input
                                              type="number"
                                              value={item.heightCm}
                                              onChange={(e) =>
                                                handleUpdatePhysicalItem(
                                                  realIdx,
                                                  'heightCm',
                                                  Number(e.target.value),
                                                )
                                              }
                                              className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center"
                                            />
                                          </div>
                                        </div>

                                        <div>
                                          <label className="block text-slate-400 mb-1">
                                            Peso Bulto (Kg)
                                          </label>
                                          <input
                                            type="number"
                                            value={item.weightPerBultoKg}
                                            onChange={(e) =>
                                              handleUpdatePhysicalItem(
                                                realIdx,
                                                'weightPerBultoKg',
                                                Number(e.target.value),
                                              )
                                            }
                                            className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                                          />
                                        </div>

                                        <div className="sm:col-span-4 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
                                          <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-bold">
                                            <input
                                              type="checkbox"
                                              checked={item.hasShowroomSample}
                                              onChange={(e) =>
                                                handleUpdatePhysicalItem(
                                                  realIdx,
                                                  'hasShowroomSample',
                                                  e.target.checked,
                                                )
                                              }
                                              className="w-4 h-4 accent-amber-500 rounded"
                                            />
                                            ¿Extrae muestra para Showroom?
                                          </label>

                                          {item.hasShowroomSample && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-slate-400">
                                                Unidades para Muestra:
                                              </span>
                                              <input
                                                type="number"
                                                value={item.sampleUnitsCount}
                                                onChange={(e) =>
                                                  handleUpdatePhysicalItem(
                                                    realIdx,
                                                    'sampleUnitsCount',
                                                    Number(e.target.value),
                                                  )
                                                }
                                                placeholder="Ej. 1"
                                                className="w-20 bg-slate-950 border border-amber-500/50 p-1.5 rounded text-amber-400 font-bold text-center text-xs"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* PALLETS / ESTIBADO */}
                                      <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-slate-300 text-xs">
                                            Configuración de Pallets / Estibado
                                            para {item.sku}
                                          </span>
                                          <button
                                            onClick={() =>
                                              handleAddPalletToItem(realIdx)
                                            }
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-[11px]"
                                          >
                                            + Agregar Nuevo Pallet
                                          </button>
                                        </div>

                                        {(item.pallets || []).map(
                                          (pallet: any, pIdx: number) => {
                                            const selectedLocCode =
                                              locations.find(
                                                (l) =>
                                                  l.id === pallet.locationId,
                                              )?.code || 'S/U';

                                            return (
                                              <div
                                                key={pIdx}
                                                className="bg-slate-900 border border-slate-800 p-3 rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                                              >
                                                <div className="sm:col-span-2 font-bold text-amber-400 flex items-center h-full">
                                                  Pallet #{pallet.palletIndex}
                                                </div>

                                                <div className="sm:col-span-3">
                                                  <label className="block text-slate-400 mb-1">
                                                    Bultos en este Pallet
                                                  </label>
                                                  <input
                                                    type="number"
                                                    value={
                                                      pallet.quantityBultos
                                                    }
                                                    onChange={(e) =>
                                                      handleUpdatePalletItem(
                                                        realIdx,
                                                        pIdx,
                                                        'quantityBultos',
                                                        Number(e.target.value),
                                                      )
                                                    }
                                                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-amber-300 font-bold text-center"
                                                  />
                                                </div>

                                                <div className="sm:col-span-5">
                                                  <label className="block text-slate-400 mb-1">
                                                    Ubicación Asignada *
                                                  </label>
                                                  <select
                                                    value={pallet.locationId}
                                                    onChange={(e) =>
                                                      handleUpdatePalletItem(
                                                        realIdx,
                                                        pIdx,
                                                        'locationId',
                                                        e.target.value,
                                                      )
                                                    }
                                                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                                                  >
                                                    {locations.map((loc) => (
                                                      <option
                                                        key={loc.id}
                                                        value={loc.id}
                                                      >
                                                        {loc.code} (
                                                        {loc.zoneName})
                                                      </option>
                                                    ))}
                                                  </select>
                                                </div>

                                                <div className="sm:col-span-2 flex gap-1 justify-end">
                                                  <button
                                                    onClick={() =>
                                                      setPrintModalData({
                                                        productSku: item.sku,
                                                        productName:
                                                          item.description,
                                                        quantityBultos:
                                                          pallet.quantityBultos,
                                                        unitsPerBox:
                                                          item.unitsPerBox,
                                                        containerNumber:
                                                          pendingContainers.find(
                                                            (c) =>
                                                              c.id ===
                                                              selectedPendingContainerId,
                                                          )?.containerNumber,
                                                        locationCode:
                                                          selectedLocCode,
                                                        warehouseName:
                                                          simpleWarehousesList.find(
                                                            (w) =>
                                                              w.id ===
                                                              dischargeWarehouseId,
                                                          )?.name,
                                                        weightPerBultoKg:
                                                          item.weightPerBultoKg,
                                                        volumePerBultoM3:
                                                          item.volumePerBultoM3,
                                                        date: generalEntryDate,
                                                      })
                                                    }
                                                    className="px-2 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[10px] flex-1 text-center"
                                                  >
                                                    Rótulo
                                                  </button>

                                                  {item.pallets.length > 1 && (
                                                    <button
                                                      onClick={() =>
                                                        handleRemovePalletFromItem(
                                                          realIdx,
                                                          pIdx,
                                                        )
                                                      }
                                                      className="px-2 py-2 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded font-bold"
                                                    >
                                                      X
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          onClick={handleProcessInboundDischarge}
                          disabled={submitting}
                          className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg hover:bg-amber-400 transition-colors"
                        >
                          CONFIRMAR DESCARGA E INGRESO AL STOCK
                        </button>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* TAB: HISTORIAL CON BOTÓN HABILITADO PARA PRUEBAS */}
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
                            <button
                              onClick={() =>
                                handleDeleteContainer(c.id, c.containerNumber)
                              }
                              className="px-2.5 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[10px] font-bold"
                            >
                              Anular / Eliminar
                            </button>
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

                  {/* MANTENIMIENTO Y SELECCIÓN MASIVA COMPLETO */}
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
                              Todos los Bloques ({locations.length} pos)
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

                      <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                        <button
                          onClick={handleSelectAllVisibleLocations}
                          className="text-amber-400 font-bold hover:underline"
                        >
                          {visibleLocationsInMaintenance.length > 0 &&
                          visibleLocationsInMaintenance.every((l) =>
                            selectedLocIdsForDelete.includes(l.id),
                          )
                            ? 'Desmarcar Visibles'
                            : 'Seleccionar Todas las Posiciones Visibles'}
                        </button>
                        <span className="text-slate-400 font-medium">
                          {selectedLocIdsForDelete.length} Seleccionadas
                        </span>
                      </div>

                      <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                        {visibleLocationsInMaintenance.map((loc) => {
                          const isSelected = selectedLocIdsForDelete.includes(
                            loc.id,
                          );
                          return (
                            <div
                              key={loc.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                isSelected
                                  ? 'bg-red-950/30 border-red-500'
                                  : 'bg-slate-950 border-slate-800'
                              }`}
                            >
                              <div
                                onClick={() =>
                                  setSelectedLocIdsForDelete((prev) =>
                                    prev.includes(loc.id)
                                      ? prev.filter((id) => id !== loc.id)
                                      : [...prev, loc.id],
                                  )
                                }
                                className="flex items-center gap-3 cursor-pointer flex-1"
                              >
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

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-bold">
                                  Capacidad:
                                </span>
                                <input
                                  type="number"
                                  step="0.5"
                                  defaultValue={loc.maxCapacityM3}
                                  className="w-16 bg-slate-900 border border-slate-800 px-2 py-1 rounded text-amber-400 font-bold text-center text-xs"
                                />
                                <span className="text-[10px] text-slate-500">
                                  m3
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {selectedLocIdsForDelete.length > 0 && (
                      <button
                        onClick={handleDeleteSelectedLocations}
                        disabled={submitting}
                        className="w-full py-3 bg-red-600 text-white font-black rounded-xl text-xs shadow-lg"
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
