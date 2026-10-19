// frontend/src/app/dashboard/inventory/page.tsx

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { inventoryService } from '@/services/inventory.service';
import PalletLabelModal from '@/components/PalletLabelModal';
import { io, Socket } from 'socket.io-client';
import {
  WarehouseOccupancy,
  InventoryStock,
  PackingListItem,
  PhysicalLocation,
  LocationTypeCategory,
  PalletLabelData,
} from '@/types/inventory.types';

// Interfaces locales para robustecer el tipado
interface PhysicalControlPallet {
  palletIndex: number;
  quantityBultos: number;
  locationId: string;
}

interface PhysicalControlItem {
  id?: string;
  sku: string;
  description: string;
  quantityBultos: number;
  unitsPerBox: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  hasShowroomSample: boolean;
  sampleUnitsCount: number;
  isChecked: boolean;
  controlledBy: string | null;
  pallets: PhysicalControlPallet[];
}

interface ContainerHistoryItem {
  id: string;
  containerNumber: string;
  warehouseId: string;
  warehouseName: string;
  arrivalDate: string;
  dischargeDate?: string | null;
  totalBultos: number;
  status: 'PENDIENTE' | 'RECIBIDO' | 'ANULADO';
  items: Array<{
    id: string;
    sku: string;
    description: string;
    quantityBultos: number;
    isControlled: boolean;
    controlledBy?: string | null;
    controlledAt?: string | null;
  }>;
}

export default function InventoryPage() {
  // ---------------------------------------------------------------------------
  // ESTADOS PRINCIPALES DE NAVEGACIÓN Y PESTAÑAS
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<
    'MALLA' | 'INBOUND' | 'HISTORIAL' | 'STOCK' | 'CONFIG'
  >('MALLA');

  // ---------------------------------------------------------------------------
  // ESTADOS DE DATOS DE LA APLICACIÓN
  // ---------------------------------------------------------------------------
  const [warehouses, setWarehouses] = useState<WarehouseOccupancy[]>([]);
  const [simpleWarehousesList, setSimpleWarehousesList] = useState<
    { id: string; name: string }[]
  >([]);
  const [stockList, setStockList] = useState<InventoryStock[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [containersHistory, setContainersHistory] = useState<
    ContainerHistoryItem[]
  >([]);

  // Estados de carga e interfaz (Feedback de UI)
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal para impresión de rótulos A4
  const [printModalData, setPrintModalData] = useState<PalletLabelData | null>(
    null,
  );

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 1 - MALLA DE OCUPACIÓN
  // ---------------------------------------------------------------------------
  const [selectedMallaWarehouseId, setSelectedMallaWarehouseId] = useState<
    string | null
  >(null);
  const [mallaZoneFilter, setMallaZoneFilter] = useState<string>('ALL');
  const [mallaCodeSearch, setMallaCodeSearch] = useState<string>('');

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 2 - CONTROL MÓVIL Y PRE-CARGA (FASE 1 Y FASE 2)
  // ---------------------------------------------------------------------------
  // Fase 1: Pre-carga de Packing List
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

  // Fase 2: Descarga Física y Control Móvil
  const [selectedPendingContainerId, setSelectedPendingContainerId] =
    useState<string>('');
  const [dischargeWarehouseId, setDischargeWarehouseId] = useState<string>('');
  const [generalEntryDate, setGeneralEntryDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [physicalControlItems, setPhysicalControlItems] = useState<
    PhysicalControlItem[]
  >([]);

  // Búsqueda rápida de ubicaciones dentro de ítems en Fase 2
  const [phase2LocationSearches, setPhase2LocationSearches] = useState<
    Record<string, string>
  >({});

  // Filtros, Acordeón y Sockets en tiempo real
  const [phase2SearchTerm, setPhase2SearchTerm] = useState<string>('');
  const [phase2Tab, setPhase2Tab] = useState<'PENDIENTES' | 'CONTROLADOS'>(
    'PENDIENTES',
  );
  const [expandedItemSkus, setExpandedItemSkus] = useState<string[]>([]);
  const [activeLocks, setActiveLocks] = useState<
    Record<string, { userName: string; userId: string }>
  >({});
  const [socket, setSocket] = useState<Socket | null>(null);

  // Usuario activo en sesión
  const [currentUser] = useState({
    id: 'usr-operario-1',
    name: 'Martín Cazorla',
  });

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 3 - HISTORIAL DE CONTENEDORES
  // ---------------------------------------------------------------------------
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');
  const [selectedContainerDetail, setSelectedContainerDetail] =
    useState<ContainerHistoryItem | null>(null);
  const [historyPage, setHistoryPage] = useState<number>(1);

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 4 - STOCK Y REUBICACIÓN DE PALLETS
  // ---------------------------------------------------------------------------
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');
  const [stockPage, setStockPage] = useState<number>(1);
  const [relocateItem, setRelocateItem] = useState<{
    productSku: string;
    productName: string;
    availableSources: Array<{
      inventoryId: string;
      locationCode: string;
      warehouseId: string;
      warehouseName: string;
      quantityBultos: number;
    }>;
  } | null>(null);
  const [selectedSourceInventoryId, setSelectedSourceInventoryId] =
    useState<string>('');
  const [relocateTargetWarehouseId, setRelocateTargetWarehouseId] =
    useState<string>('');
  const [relocateTargetLocId, setRelocateTargetLocId] = useState<string>('');
  const [relocateSearchLocQuery, setRelocateSearchLocQuery] =
    useState<string>('');
  const [relocateQuantity, setRelocateQuantity] = useState<number>(1);

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 5 - MANTENIMIENTO Y CONFIGURACIÓN DE UBICACIONES
  // ---------------------------------------------------------------------------
  const [newWhName, setNewWhName] = useState<string>('');
  const [targetConfigWhId, setTargetConfigWhId] = useState<string>('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('ALL');
  const [configPage, setConfigPage] = useState<number>(1);

  const [genCategory, setGenCategory] = useState<LocationTypeCategory>('RACK');
  const [genAreaName, setGenAreaName] = useState<string>('Rack Izquierda');
  const [genLevelsInput, setGenLevelsInput] = useState<string>('A, B, C');
  const [genPosStart, setGenPosStart] = useState<number>(1);
  const [genPosEnd, setGenPosEnd] = useState<number>(84);
  const [genCapacityM3, setGenCapacityM3] = useState<number>(1.8);

  const [selectedLocIdsForDelete, setSelectedLocIdsForDelete] = useState<
    string[]
  >([]);
  const [editedCapacities, setEditedCapacities] = useState<
    Record<string, number>
  >({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  const ITEMS_PER_PAGE = 10;

  // ---------------------------------------------------------------------------
  // FUNCIONES MEMOIZADAS DE CARGA DE DATOS (API)
  // ---------------------------------------------------------------------------
  const loadLocationsForWarehouse = useCallback(async (whId: string) => {
    if (!whId) {
      setLocations([]);
      return;
    }
    try {
      const locs = await inventoryService.getAvailableLocations(whId);
      setLocations(locs);
      setSelectedLocIdsForDelete([]);
      setEditedCapacities({});
    } catch (err) {
      console.error('Error al cargar ubicaciones:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
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
      setContainersHistory(contData as ContainerHistoryItem[]);

      if (whList.length > 0) {
        setDischargeWarehouseId((prev) =>
          !prev || !whList.some((w: { id: string }) => w.id === prev)
            ? whList[0].id
            : prev,
        );
        setTargetConfigWhId((prev) =>
          !prev || !whList.some((w: { id: string }) => w.id === prev)
            ? whList[0].id
            : prev,
        );
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error de conexión con el servidor.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // EFECTOS DE INICIALIZACIÓN Y WEBSOCKETS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadData();

    const socketUrl =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const newSocket = io(socketUrl, { transports: ['websocket'] });
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;

    socket.on(
      'current_locks',
      (locks: Record<string, { userName: string; userId: string }>) => {
        setActiveLocks(locks);
      },
    );

    socket.on(
      'item_locked',
      (payload: { sku: string; userName: string; userId: string }) => {
        setActiveLocks((prev) => ({
          ...prev,
          [payload.sku]: { userName: payload.userName, userId: payload.userId },
        }));
      },
    );

    socket.on('item_unlocked', (payload: { sku: string }) => {
      setActiveLocks((prev) => {
        const updated = { ...prev };
        delete updated[payload.sku];
        return updated;
      });
    });

    socket.on(
      'item_status_updated',
      (payload: { sku: string; isControlled: boolean; userName: string }) => {
        setPhysicalControlItems((prev) =>
          prev.map((item) =>
            item.sku === payload.sku
              ? {
                  ...item,
                  isChecked: payload.isControlled,
                  controlledBy: payload.isControlled ? payload.userName : null,
                }
              : item,
          ),
        );
      },
    );

    return () => {
      socket.off('current_locks');
      socket.off('item_locked');
      socket.off('item_unlocked');
      socket.off('item_status_updated');
    };
  }, [socket]);

  useEffect(() => {
    if (dischargeWarehouseId) {
      loadLocationsForWarehouse(dischargeWarehouseId);
    }
  }, [dischargeWarehouseId, loadLocationsForWarehouse]);

  useEffect(() => {
    if (targetConfigWhId) {
      loadLocationsForWarehouse(targetConfigWhId);
      setSelectedAreaFilter('ALL');
      setEditedCapacities({});
    }
  }, [targetConfigWhId, loadLocationsForWarehouse]);

  useEffect(() => {
    if (selectedPendingContainerId) {
      if (socket) {
        socket.emit('join_container', selectedPendingContainerId);
      }

      const container = containersHistory.find(
        (c) => c.id === selectedPendingContainerId,
      );
      if (container) {
        const initialWhId =
          container.warehouseId || simpleWarehousesList[0]?.id || '';
        setDischargeWarehouseId(initialWhId);

        if (container.items) {
          const defaultLoc = locations[0]?.id || '';
          setPhysicalControlItems(
            container.items.map((i) => {
              const qtyBultos = i.quantityBultos || 1;
              return {
                sku: i.sku || '',
                description: i.description || '',
                quantityBultos: qtyBultos,
                unitsPerBox: 1,
                lengthCm: 40,
                widthCm: 30,
                heightCm: 30,
                weightPerBultoKg: 10,
                volumePerBultoM3: 0.036,
                hasShowroomSample: false,
                sampleUnitsCount: 0,
                isChecked: Boolean(i.isControlled),
                controlledBy: i.controlledBy || null,
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
    simpleWarehousesList,
    socket,
    locations,
  ]);

  useEffect(() => {
    if (locations.length > 0 && physicalControlItems.length > 0) {
      const defaultLocId = locations[0].id;
      setPhysicalControlItems((prev) =>
        prev.map((item) => ({
          ...item,
          pallets: (item.pallets || []).map((p) => ({
            ...p,
            locationId: p.locationId || defaultLocId,
          })),
        })),
      );
    }
  }, [locations]);

  // ---------------------------------------------------------------------------
  // PROPIEDADES COMPUTADAS (USEMEMO)
  // ---------------------------------------------------------------------------
  const pendingContainers = useMemo(
    () => containersHistory.filter((c) => c.status === 'PENDIENTE'),
    [containersHistory],
  );

  const filteredHistoryContainers = useMemo(() => {
    return containersHistory.filter((c) => {
      const query = historySearchQuery.toLowerCase().trim();
      const matchesSearch =
        !query || c.containerNumber.toLowerCase().includes(query);

      const matchesDate =
        !historyDateFilter ||
        new Date(c.arrivalDate).toISOString().split('T')[0] ===
          historyDateFilter;

      return matchesSearch && matchesDate;
    });
  }, [containersHistory, historySearchQuery, historyDateFilter]);

  const paginatedHistoryContainers = useMemo(() => {
    const start = (historyPage - 1) * ITEMS_PER_PAGE;
    return filteredHistoryContainers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredHistoryContainers, historyPage]);

  const consolidatedStockMap = useMemo(() => {
    const map = new Map<
      string,
      {
        productSku: string;
        productName: string;
        unitsPerBox: number;
        locations: Array<{
          inventoryId: string;
          warehouseId: string;
          warehouseName: string;
          locationId: string;
          locationCode: string;
          quantityBultos: number;
          containerNumber?: string;
          updatedAt: string;
        }>;
        totalBultos: number;
      }
    >();

    stockList.forEach((st) => {
      const key = st.productSku;
      if (!map.has(key)) {
        map.set(key, {
          productSku: st.productSku,
          productName: st.productName,
          unitsPerBox: st.unitsPerBox || 1,
          locations: [],
          totalBultos: 0,
        });
      }

      const item = map.get(key)!;
      item.locations.push({
        inventoryId: st.id,
        warehouseId: st.warehouseId,
        warehouseName: st.warehouseName,
        locationId: st.locationId,
        locationCode: st.locationCode,
        quantityBultos: st.quantityBultos,
        containerNumber: st.containerNumber,
        updatedAt: st.updatedAt,
      });
      item.totalBultos += st.quantityBultos;
    });

    return Array.from(map.values());
  }, [stockList]);

  const filteredConsolidatedStock = useMemo(() => {
    const query = stockSearchQuery.toLowerCase().trim();
    if (!query) return consolidatedStockMap;

    return consolidatedStockMap.filter(
      (item) =>
        item.productSku.toLowerCase().includes(query) ||
        item.productName.toLowerCase().includes(query),
    );
  }, [consolidatedStockMap, stockSearchQuery]);

  const paginatedConsolidatedStock = useMemo(() => {
    const start = (stockPage - 1) * ITEMS_PER_PAGE;
    return filteredConsolidatedStock.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredConsolidatedStock, stockPage]);

  const visibleLocationsInMaintenance = useMemo(() => {
    if (selectedAreaFilter === 'ALL') return locations;
    return locations.filter((l) => l.zoneName === selectedAreaFilter);
  }, [locations, selectedAreaFilter]);

  const paginatedLocations = useMemo(() => {
    const start = (configPage - 1) * ITEMS_PER_PAGE;
    return visibleLocationsInMaintenance.slice(start, start + ITEMS_PER_PAGE);
  }, [visibleLocationsInMaintenance, configPage]);

  const availableAreasInWarehouse = useMemo(() => {
    const areas = new Set<string>();
    locations.forEach((l) => {
      if (l.zoneName) areas.add(l.zoneName);
    });
    return Array.from(areas);
  }, [locations]);

  const selectedMallaWarehouse = useMemo(() => {
    if (!selectedMallaWarehouseId) return null;
    return warehouses.find((w) => w.id === selectedMallaWarehouseId) || null;
  }, [warehouses, selectedMallaWarehouseId]);

  const availableMallaZones = useMemo(() => {
    if (!selectedMallaWarehouse) return [];
    const zones = new Set<string>();
    selectedMallaWarehouse.locations.forEach((loc) => {
      if (loc.zoneName) zones.add(loc.zoneName);
    });
    return Array.from(zones);
  }, [selectedMallaWarehouse]);

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

  const filteredRelocateLocations = useMemo(() => {
    const q = relocateSearchLocQuery.toLowerCase().trim();
    if (!q) return locations.slice(0, 30);
    return locations
      .filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          (l.zoneName && l.zoneName.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [locations, relocateSearchLocQuery]);

  // ---------------------------------------------------------------------------
  // MANEJADORES DE EVENTOS DE INTERFAZ
  // ---------------------------------------------------------------------------
  const toggleItemAccordion = (sku: string) => {
    const lock = activeLocks[sku];
    if (lock && lock.userId !== currentUser.id) return;

    const isCurrentlyExpanded = expandedItemSkus.includes(sku);

    if (isCurrentlyExpanded) {
      setExpandedItemSkus((prev) => prev.filter((s) => s !== sku));
      if (socket && selectedPendingContainerId) {
        socket.emit('unlock_item', {
          containerId: selectedPendingContainerId,
          sku,
        });
      }
    } else {
      setExpandedItemSkus((prev) => [...prev, sku]);
      if (socket && selectedPendingContainerId) {
        socket.emit('lock_item', {
          containerId: selectedPendingContainerId,
          sku,
          userName: currentUser.name,
          userId: currentUser.id,
        });
      }
    }
  };

  const handleUpdatePackingItem = (
    index: number,
    field: keyof PackingListItem,
    value: unknown,
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

  const handleUpdatePhysicalItem = (
    itemIdx: number,
    field: keyof PhysicalControlItem,
    value: unknown,
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

  const toggleItemControlStatus = (itemIdx: number) => {
    const item = physicalControlItems[itemIdx];
    const newStatus = !item.isChecked;

    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      updated[itemIdx] = {
        ...item,
        isChecked: newStatus,
        controlledBy: newStatus ? currentUser.name : null,
      };
      return updated;
    });

    if (socket && selectedPendingContainerId) {
      socket.emit('item_controlled_toggle', {
        containerId: selectedPendingContainerId,
        sku: item.sku,
        isControlled: newStatus,
        userName: currentUser.name,
      });

      socket.emit('unlock_item', {
        containerId: selectedPendingContainerId,
        sku: item.sku,
      });
      setExpandedItemSkus((prev) => prev.filter((s) => s !== item.sku));
    }
  };

  const handleAddPalletToItem = (itemIdx: number) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      const currentPallets = item.pallets || [];
      const defaultLoc = locations[0]?.id || '';

      const allocatedBultos = currentPallets.reduce(
        (acc: number, p) => acc + (Number(p.quantityBultos) || 0),
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
        .filter((_, pIdx) => pIdx !== palletIdx)
        .map((p, idx) => ({ ...p, palletIndex: idx + 1 }));
      updated[itemIdx] = item;
      return updated;
    });
  };

  const handleUpdatePalletItem = (
    itemIdx: number,
    palletIdx: number,
    field: keyof PhysicalControlPallet,
    value: unknown,
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

  // ---------------------------------------------------------------------------
  // ACCIONES HTTP CON EL BACKEND (CREAR, PROCESAR Y BORRAR)
  // ---------------------------------------------------------------------------
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error al crear el depósito.',
      );
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
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const backendMessage = error.response?.data?.message;
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

    const itemsToSubmit: Array<{
      sku: string;
      description: string;
      quantityBultos: number;
      unitsPerBox: number;
      weightPerBultoKg: number;
      volumePerBultoM3: number;
      sampleUnits: number;
      entryDate: string;
      locationId: string;
      warehouseId: string;
    }> = [];
    const defaultLocId = locations[0]?.id;

    for (const item of physicalControlItems) {
      const pallets = item.pallets || [];
      const sumPalletBultos = pallets.reduce(
        (acc: number, p) => acc + (Number(p.quantityBultos) || 0),
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message ||
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error al eliminar el contenedor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRelocation = async () => {
    if (!relocateItem) return;
    if (!selectedSourceInventoryId) {
      setErrorMsg('Seleccione la ubicación de origen.');
      return;
    }
    if (!relocateTargetLocId) {
      setErrorMsg('Seleccione la ubicación de destino.');
      return;
    }

    const source = relocateItem.availableSources.find(
      (s) => s.inventoryId === selectedSourceInventoryId,
    );
    if (!source) return;

    if (relocateQuantity <= 0 || relocateQuantity > source.quantityBultos) {
      setErrorMsg(
        `La cantidad a mover debe ser entre 1 y ${source.quantityBultos} bultos.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await inventoryService.transferStock({
        inventoryId: selectedSourceInventoryId,
        targetLocationId: relocateTargetLocId,
        quantityBultos: relocateQuantity,
        userId: currentUser.id,
      });

      setSuccessMsg(
        `Pallet de ${relocateItem.productSku} reubicado exitosamente a la nueva posición.`,
      );
      setRelocateItem(null);
      setSelectedSourceInventoryId('');
      setRelocateTargetWarehouseId('');
      setRelocateTargetLocId('');
      setRelocateSearchLocQuery('');
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error al reubicar el pallet.',
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
        maxCapacityM3PerUnit: Number(genCapacityM3) || 1.8,
      });
      setSuccessMsg('Ubicaciones generadas exitosamente.');
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(error.response?.data?.message || 'Error al generar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSelectAllLocations = () => {
    const allVisibleIds = visibleLocationsInMaintenance.map((l) => l.id);
    const areAllSelected =
      allVisibleIds.length > 0 &&
      allVisibleIds.every((id) => selectedLocIdsForDelete.includes(id));

    if (areAllSelected) {
      setSelectedLocIdsForDelete((prev) =>
        prev.filter((id) => !allVisibleIds.includes(id)),
      );
    } else {
      setSelectedLocIdsForDelete((prev) =>
        Array.from(new Set([...prev, ...allVisibleIds])),
      );
    }
  };

  const handleSaveCapacityChanges = async () => {
    const updates = Object.entries(editedCapacities).map(([id, capacity]) => ({
      id,
      capacity: Number(capacity),
    }));

    if (updates.length === 0) return;

    setSubmitting(true);
    try {
      await inventoryService.updateLocationsCapacity(updates);
      setSuccessMsg(
        `Capacidad actualizada en ${updates.length} ubicación(es).`,
      );
      setEditedCapacities({});
      await loadLocationsForWarehouse(targetConfigWhId);
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error al actualizar capacidades.',
      );
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
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message || 'Error al eliminar posiciones.',
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
        `¿Confirma eliminar el depósito "${wh?.name}" y TODAS sus ubicaciones?`,
      )
    )
      return;

    setSubmitting(true);
    try {
      await inventoryService.deleteWarehouse(targetConfigWhId);
      setSuccessMsg(`Depósito "${wh?.name}" eliminado completamente.`);
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message ||
          'No se puede eliminar un depósito con stock activo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = physicalControlItems.filter((i) => !i.isChecked).length;
  const checkedCount = physicalControlItems.filter((i) => i.isChecked).length;
  const editedCapacitiesCount = Object.keys(editedCapacities).length;

  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER']}>
      <main className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6 font-sans">
        {/* ENCABEZADO Y NAVEGACIÓN */}
        <header className="flex flex-wrap justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-wide">
              Gestión de Inventario & Control Móvil
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Pre-carga de Packing List, descarga móvil desde celular, historial
              y rotulado A4
            </p>
          </div>

          <nav
            aria-label="Navegación de secciones de inventario"
            className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1"
          >
            <button
              type="button"
              onClick={() => setActiveTab('MALLA')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'MALLA'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Malla Ocupación
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INBOUND')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'INBOUND'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Control Móvil & Pre-Carga
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('HISTORIAL')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'HISTORIAL'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Historial Contenedores
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('STOCK')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'STOCK'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Stock & Rótulos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'CONFIG'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mantenimiento Ubicaciones
            </button>
          </nav>
        </header>

        {/* NOTIFICACIONES Y ALERTAS */}
        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="bg-red-950/80 border border-red-500/80 text-red-200 p-4 rounded-xl mb-6 text-sm flex justify-between items-center"
          >
            <span>Atención: {errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="Cerrar notificación de error"
              className="text-xs font-bold underline hover:text-white"
            >
              Cerrar
            </button>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            className="bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 p-4 rounded-xl mb-6 text-sm flex justify-between items-center"
          >
            <span>Éxito: {successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              aria-label="Cerrar mensaje de éxito"
              className="text-xs font-bold underline hover:text-white"
            >
              Cerrar
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16" aria-label="Cargando información">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-400"></div>
            <p className="mt-4 text-slate-400 text-sm">
              Cargando inventario...
            </p>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------------------ */}
            {/* TAB: MALLA OCUPACIÓN */}
            {/* ------------------------------------------------------------------ */}
            {activeTab === 'MALLA' && (
              <section className="space-y-6">
                {!selectedMallaWarehouse ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {warehouses.map((wh) => {
                      const totalM3 = Number(wh.totalCapacityM3) || 1;
                      const usedM3 = Number(wh.usedCapacityM3) || 0;
                      const percentage = Math.min(
                        100,
                        Math.round((usedM3 / totalM3) * 100),
                      );

                      return (
                        <button
                          type="button"
                          key={wh.id}
                          onClick={() => setSelectedMallaWarehouseId(wh.id)}
                          className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between hover:border-amber-500/50 transition-all cursor-pointer text-left w-full"
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

                          <div className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-xl text-xs mt-2 transition-colors flex items-center justify-center gap-2">
                            <span>Ver Mapa de Posiciones</span>
                            <span aria-hidden="true">→</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
                    <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <button
                          type="button"
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
                          <label
                            htmlFor="malla-search-input"
                            className="sr-only"
                          >
                            Buscar posición
                          </label>
                          <input
                            id="malla-search-input"
                            type="text"
                            placeholder="Buscar posición (Ej. A21)..."
                            value={mallaCodeSearch}
                            onChange={(e) => setMallaCodeSearch(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="malla-zone-filter"
                            className="sr-only"
                          >
                            Filtrar por Área o Rack
                          </label>
                          <select
                            id="malla-zone-filter"
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[550px] overflow-y-auto pr-1">
                      {filteredMallaLocations.map((loc) => (
                        <div
                          key={loc.id}
                          className="p-3 rounded-xl border bg-slate-950 border-slate-800 text-xs"
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
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* TAB: CONTROL MÓVIL Y PRE-CARGA */}
            {/* ------------------------------------------------------------------ */}
            {activeTab === 'INBOUND' && (
              <section className="space-y-6">
                {/* FASE 1 */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 1: Pre-carga de Contenedores / Packing List
                  </h2>

                  <div>
                    <label
                      htmlFor="container-number-input"
                      className="block text-xs text-slate-300 mb-1"
                    >
                      Número de Contenedor / Remito *
                    </label>
                    <input
                      id="container-number-input"
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
                        type="button"
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
                          <label
                            htmlFor={`sku-input-${idx}`}
                            className="block text-slate-400 mb-1"
                          >
                            Código SKU *
                          </label>
                          <input
                            id={`sku-input-${idx}`}
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
                          <label
                            htmlFor={`name-input-${idx}`}
                            className="block text-slate-400 mb-1"
                          >
                            Descripción *
                          </label>
                          <input
                            id={`name-input-${idx}`}
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
                          <label
                            htmlFor={`bultos-input-${idx}`}
                            className="block text-slate-400 mb-1"
                          >
                            Total Bultos
                          </label>
                          <input
                            id={`bultos-input-${idx}`}
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
                          <label
                            htmlFor={`units-input-${idx}`}
                            className="block text-slate-400 mb-1"
                          >
                            Total Unidades
                          </label>
                          <input
                            id={`units-input-${idx}`}
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
                              type="button"
                              onClick={() => handleRemovePackingItem(idx)}
                              aria-label={`Eliminar producto #${idx + 1}`}
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
                    type="button"
                    onClick={handleSavePackingList}
                    disabled={submitting}
                    className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    PRE-CARGAR PACKING LIST EN BASE DE DATOS
                  </button>
                </div>

                {/* FASE 2 */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-5">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    FASE 2: Control Móvil y Descarga Físico-Estibado
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="pending-container-select"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        Seleccionar Contenedor Arribado *
                      </label>
                      <select
                        id="pending-container-select"
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
                      <label
                        htmlFor="discharge-warehouse-select"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        Depósito de Ingreso *
                      </label>
                      <select
                        id="discharge-warehouse-select"
                        value={dischargeWarehouseId}
                        onChange={(e) => {
                          const newWhId = e.target.value;
                          setDischargeWarehouseId(newWhId);
                          loadLocationsForWarehouse(newWhId);
                        }}
                        className="w-full bg-slate-950 border border-amber-500/80 rounded-xl p-3 text-sm text-amber-300 font-bold cursor-pointer hover:border-amber-400"
                      >
                        {simpleWarehousesList.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            {wh.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="entry-date-input"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        Fecha Ingreso *
                      </label>
                      <input
                        id="entry-date-input"
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
                        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 gap-1">
                            <button
                              type="button"
                              onClick={() => setPhase2Tab('PENDIENTES')}
                              className={`px-3 py-1.5 rounded text-xs font-bold ${
                                phase2Tab === 'PENDIENTES'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400'
                              }`}
                            >
                              Pendientes ({pendingCount})
                            </button>
                            <button
                              type="button"
                              onClick={() => setPhase2Tab('CONTROLADOS')}
                              className={`px-3 py-1.5 rounded text-xs font-bold ${
                                phase2Tab === 'CONTROLADOS'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400'
                              }`}
                            >
                              Controlados ({checkedCount})
                            </button>
                          </div>

                          <div className="flex-1 min-w-[200px]">
                            <label
                              htmlFor="phase2-search-input"
                              className="sr-only"
                            >
                              Buscar por SKU o Descripción
                            </label>
                            <input
                              id="phase2-search-input"
                              type="text"
                              placeholder="🔍 Buscar por SKU o Descripción..."
                              value={phase2SearchTerm}
                              onChange={(e) =>
                                setPhase2SearchTerm(e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {filteredPhysicalControlItems.map((item) => {
                            const realIdx = physicalControlItems.findIndex(
                              (i) => i.sku === item.sku,
                            );
                            const isExpanded = expandedItemSkus.includes(
                              item.sku,
                            );
                            const activeLock = activeLocks[item.sku];
                            const isLockedByOther =
                              activeLock &&
                              activeLock.userId !== currentUser.id;

                            return (
                              <div
                                key={item.sku}
                                className={`bg-slate-950 border rounded-xl ${
                                  isLockedByOther
                                    ? 'border-purple-500/50'
                                    : item.isChecked
                                      ? 'border-emerald-500/50'
                                      : 'border-slate-800'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleItemAccordion(item.sku)}
                                  className="w-full text-left p-3.5 flex justify-between items-center select-none"
                                >
                                  <div>
                                    <h3 className="font-black text-white text-sm">
                                      SKU:{' '}
                                      <span className="text-amber-400">
                                        {item.sku}
                                      </span>{' '}
                                      - {item.description}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Bultos:{' '}
                                      <strong className="text-amber-400">
                                        {item.quantityBultos}
                                      </strong>
                                      {item.controlledBy && (
                                        <span className="ml-2 text-emerald-400 font-bold">
                                          (✓ Auditado por {item.controlledBy})
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleItemControlStatus(realIdx);
                                      }}
                                      className={`px-3 py-1.5 rounded text-xs font-bold ${
                                        item.isChecked
                                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                          : 'bg-slate-800 text-slate-300'
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
                                </button>

                                {/* DESPLEGABLE DE EDICIÓN Y PALLETS */}
                                {isExpanded && !isLockedByOther && (
                                  <div className="p-4 border-t border-slate-800 space-y-4 text-xs bg-slate-900/40 rounded-b-xl">
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-900 p-3 rounded-lg border border-slate-800">
                                      <div>
                                        <label
                                          htmlFor={`units-per-box-${realIdx}`}
                                          className="block text-slate-400 mb-1"
                                        >
                                          Unidades por Bulto
                                        </label>
                                        <input
                                          id={`units-per-box-${realIdx}`}
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
                                        <span className="block text-slate-400 mb-1">
                                          Medidas (L x A x H cm)
                                        </span>
                                        <div className="flex gap-1">
                                          <input
                                            aria-label="Largo en cm"
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
                                            aria-label="Ancho en cm"
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
                                            aria-label="Alto en cm"
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
                                        <label
                                          htmlFor={`weight-input-${realIdx}`}
                                          className="block text-slate-400 mb-1"
                                        >
                                          Peso por Bulto (Kg)
                                        </label>
                                        <input
                                          id={`weight-input-${realIdx}`}
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

                                      <div className="flex flex-col justify-end">
                                        <label className="flex items-center gap-2 cursor-pointer text-amber-300 font-bold mb-1">
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
                                          Muestra para Showroom
                                        </label>
                                        {item.hasShowroomSample && (
                                          <input
                                            aria-label="Cantidad de unidades para muestra"
                                            type="number"
                                            placeholder="Cant. Unidades"
                                            value={item.sampleUnitsCount}
                                            onChange={(e) =>
                                              handleUpdatePhysicalItem(
                                                realIdx,
                                                'sampleUnitsCount',
                                                Number(e.target.value),
                                              )
                                            }
                                            className="w-full bg-slate-950 border border-amber-500/50 p-1.5 rounded text-amber-400 font-bold text-center"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* GESTIÓN DE PALLETS */}
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-300 text-xs">
                                          Distribución de Pallets y Estibado
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAddPalletToItem(realIdx)
                                          }
                                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-[11px]"
                                        >
                                          + Agregar Otro Pallet
                                        </button>
                                      </div>

                                      {(item.pallets || []).map(
                                        (pallet, pIdx) => {
                                          const keySearch = `${item.sku}_${pIdx}`;
                                          const locSearchQuery = (
                                            phase2LocationSearches[keySearch] ||
                                            ''
                                          )
                                            .toLowerCase()
                                            .trim();

                                          const filteredLocList = locSearchQuery
                                            ? locations.filter(
                                                (l) =>
                                                  l.code
                                                    .toLowerCase()
                                                    .includes(locSearchQuery) ||
                                                  (l.zoneName &&
                                                    l.zoneName
                                                      .toLowerCase()
                                                      .includes(
                                                        locSearchQuery,
                                                      )),
                                              )
                                            : locations;

                                          return (
                                            <div
                                              key={pIdx}
                                              className="bg-slate-900 border border-slate-800 p-3 rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                                            >
                                              <div className="sm:col-span-2 font-bold text-amber-400">
                                                Pallet #{pallet.palletIndex}
                                              </div>

                                              <div className="sm:col-span-3">
                                                <label
                                                  htmlFor={`pallet-qty-${realIdx}-${pIdx}`}
                                                  className="block text-slate-400 mb-1"
                                                >
                                                  Bultos en Pallet
                                                </label>
                                                <input
                                                  id={`pallet-qty-${realIdx}-${pIdx}`}
                                                  type="number"
                                                  value={pallet.quantityBultos}
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
                                                <label
                                                  htmlFor={`pallet-loc-${realIdx}-${pIdx}`}
                                                  className="block text-slate-400 mb-1"
                                                >
                                                  Buscar y Asignar Ubicación *
                                                </label>
                                                <div className="space-y-1">
                                                  <input
                                                    type="text"
                                                    placeholder="🔍 Escriba para filtrar..."
                                                    value={
                                                      phase2LocationSearches[
                                                        keySearch
                                                      ] || ''
                                                    }
                                                    onChange={(e) =>
                                                      setPhase2LocationSearches(
                                                        (prev) => ({
                                                          ...prev,
                                                          [keySearch]:
                                                            e.target.value,
                                                        }),
                                                      )
                                                    }
                                                    className="w-full bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-xs"
                                                  />
                                                  <select
                                                    id={`pallet-loc-${realIdx}-${pIdx}`}
                                                    value={pallet.locationId}
                                                    onChange={(e) =>
                                                      handleUpdatePalletItem(
                                                        realIdx,
                                                        pIdx,
                                                        'locationId',
                                                        e.target.value,
                                                      )
                                                    }
                                                    className="w-full bg-slate-950 border border-amber-500/40 p-2 rounded text-white font-bold text-xs"
                                                  >
                                                    {filteredLocList.length >
                                                    0 ? (
                                                      filteredLocList.map(
                                                        (loc) => (
                                                          <option
                                                            key={loc.id}
                                                            value={loc.id}
                                                          >
                                                            {loc.code} (
                                                            {loc.zoneName})
                                                          </option>
                                                        ),
                                                      )
                                                    ) : (
                                                      <option value="">
                                                        Sin ubicaciones en este
                                                        depósito
                                                      </option>
                                                    )}
                                                  </select>
                                                </div>
                                              </div>

                                              <div className="sm:col-span-2 flex gap-1 justify-end">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setPrintModalData({
                                                      productSku: item.sku,
                                                      productName:
                                                        item.description,
                                                      quantityBultos:
                                                        pallet.quantityBultos,
                                                      locationCode:
                                                        locations.find(
                                                          (l) =>
                                                            l.id ===
                                                            pallet.locationId,
                                                        )?.code || 'S/U',
                                                      warehouseName:
                                                        simpleWarehousesList.find(
                                                          (w) =>
                                                            w.id ===
                                                            dischargeWarehouseId,
                                                        )?.name,
                                                      date: generalEntryDate,
                                                    })
                                                  }
                                                  className="px-2.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[10px] flex-1 text-center"
                                                >
                                                  Rótulo A4
                                                </button>

                                                {item.pallets.length > 1 && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleRemovePalletFromItem(
                                                        realIdx,
                                                        pIdx,
                                                      )
                                                    }
                                                    aria-label={`Eliminar Pallet #${pallet.palletIndex}`}
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

                        <button
                          type="button"
                          onClick={handleProcessInboundDischarge}
                          disabled={submitting}
                          className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
                        >
                          CONFIRMAR DESCARGA E INGRESO AL STOCK
                        </button>
                      </div>
                    )}
                </div>
              </section>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* TAB: HISTORIAL */}
            {/* ------------------------------------------------------------------ */}
            {activeTab === 'HISTORIAL' && (
              <section className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-amber-400">
                    Historial de Contenedores e Inbound
                  </h2>

                  <div className="flex flex-wrap gap-2">
                    <div>
                      <label htmlFor="history-search-input" className="sr-only">
                        Buscar por Contenedor
                      </label>
                      <input
                        id="history-search-input"
                        type="text"
                        placeholder="Buscar por Contenedor..."
                        value={historySearchQuery}
                        onChange={(e) => {
                          setHistorySearchQuery(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="history-date-filter" className="sr-only">
                        Filtrar por Fecha
                      </label>
                      <input
                        id="history-date-filter"
                        type="date"
                        value={historyDateFilter}
                        onChange={(e) => {
                          setHistoryDateFilter(e.target.value);
                          setHistoryPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    {(historySearchQuery || historyDateFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistorySearchQuery('');
                          setHistoryDateFilter('');
                        }}
                        className="text-xs text-amber-400 font-bold px-2 hover:underline"
                      >
                        Limpiar Filtros
                      </button>
                    )}
                  </div>
                </div>

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
                      {paginatedHistoryContainers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-950/50">
                          <td className="p-3">
                            <button
                              type="button"
                              className="font-mono font-bold text-amber-400 hover:underline text-left"
                              onClick={() => setSelectedContainerDetail(c)}
                            >
                              {c.containerNumber}{' '}
                              <span aria-hidden="true">🔍</span>
                            </button>
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
                          <td className="p-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedContainerDetail(c)}
                              className="px-2 py-1 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded text-[10px] font-bold"
                            >
                              Ver Detalle
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteContainer(c.id, c.containerNumber)
                              }
                              className="px-2 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[10px] font-bold"
                            >
                              Anular
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredHistoryContainers.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-800">
                    <span className="text-slate-400">
                      Mostrando {paginatedHistoryContainers.length} de{' '}
                      {filteredHistoryContainers.length} contenedores
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={historyPage === 1}
                        onClick={() => setHistoryPage((p) => p - 1)}
                        className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-1 bg-slate-950 text-amber-400 font-mono font-bold rounded">
                        Pág. {historyPage}
                      </span>
                      <button
                        type="button"
                        disabled={
                          historyPage * ITEMS_PER_PAGE >=
                          filteredHistoryContainers.length
                        }
                        onClick={() => setHistoryPage((p) => p + 1)}
                        className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* TAB: STOCK & RÓTULOS */}
            {/* ------------------------------------------------------------------ */}
            {activeTab === 'STOCK' && (
              <section className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-amber-400">
                    Control de Stock e Impresión de Rótulos A4
                  </h2>

                  <div>
                    <label htmlFor="stock-search-input" className="sr-only">
                      Buscar por SKU o Producto
                    </label>
                    <input
                      id="stock-search-input"
                      type="text"
                      placeholder="🔍 Buscar por SKU o Producto..."
                      value={stockSearchQuery}
                      onChange={(e) => {
                        setStockSearchQuery(e.target.value);
                        setStockPage(1);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold w-full sm:w-72"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {paginatedConsolidatedStock.map((prod) => (
                    <div
                      key={prod.productSku}
                      className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <div>
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded">
                            SKU: {prod.productSku}
                          </span>
                          <h3 className="text-sm font-bold text-white mt-1">
                            {prod.productName}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">
                              Stock Total Bultos
                            </span>
                            <span className="text-lg font-black text-emerald-400 font-mono">
                              {prod.totalBultos} Bultos
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const firstSource = prod.locations[0];
                              setRelocateItem({
                                productSku: prod.productSku,
                                productName: prod.productName,
                                availableSources: prod.locations,
                              });
                              setSelectedSourceInventoryId(
                                firstSource?.inventoryId || '',
                              );
                              setRelocateQuantity(
                                firstSource?.quantityBultos || 1,
                              );
                              setRelocateTargetWarehouseId(
                                firstSource?.warehouseId || '',
                              );
                              setRelocateTargetLocId('');
                              setRelocateSearchLocQuery('');

                              if (firstSource) {
                                loadLocationsForWarehouse(
                                  firstSource.warehouseId,
                                );
                              }
                            }}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs shadow-md"
                          >
                            Reubicar Pallet / Mover
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Ubicaciones / Posiciones donde se encuentra guardado:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {prod.locations.map((loc) => (
                            <div
                              key={loc.inventoryId}
                              className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex justify-between items-center text-xs"
                            >
                              <div>
                                <span className="font-bold text-white block">
                                  {loc.locationCode}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {loc.warehouseName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                  {loc.quantityBultos} bultos
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setPrintModalData({
                                      productSku: prod.productSku,
                                      productName: prod.productName,
                                      quantityBultos: loc.quantityBultos,
                                      locationCode: loc.locationCode,
                                      warehouseName: loc.warehouseName,
                                      date: new Date(
                                        loc.updatedAt,
                                      ).toLocaleDateString('es-AR'),
                                    })
                                  }
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[10px]"
                                >
                                  Rótulo A4
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredConsolidatedStock.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-800">
                    <span className="text-slate-400">
                      Mostrando {paginatedConsolidatedStock.length} de{' '}
                      {filteredConsolidatedStock.length} SKUs
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={stockPage === 1}
                        onClick={() => setStockPage((p) => p - 1)}
                        className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-1 bg-slate-950 text-amber-400 font-mono font-bold rounded">
                        Pág. {stockPage}
                      </span>
                      <button
                        type="button"
                        disabled={
                          stockPage * ITEMS_PER_PAGE >=
                          filteredConsolidatedStock.length
                        }
                        onClick={() => setStockPage((p) => p + 1)}
                        className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* TAB: CONFIGURACIÓN Y MANTENIMIENTO MASIVO */}
            {/* ------------------------------------------------------------------ */}
            {activeTab === 'CONFIG' && (
              <section className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2 mb-4">
                    Alta Nuevo Depósito
                  </h2>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor="new-wh-name-input" className="sr-only">
                        Nombre del Depósito
                      </label>
                      <input
                        id="new-wh-name-input"
                        type="text"
                        value={newWhName}
                        onChange={(e) => setNewWhName(e.target.value)}
                        placeholder="Nombre del Depósito..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateWarehouse}
                      disabled={submitting}
                      className="px-5 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs disabled:opacity-50"
                    >
                      + CREAR DEPÓSITO
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* GENERADOR POR RANGOS */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                    <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                      Generador Inteligente por Rangos
                    </h2>

                    <div>
                      <label
                        htmlFor="gen-target-wh-select"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        Depósito Destino *
                      </label>
                      <select
                        id="gen-target-wh-select"
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
                        <label
                          htmlFor="gen-category-select"
                          className="block text-slate-400 mb-1"
                        >
                          Estructura
                        </label>
                        <select
                          id="gen-category-select"
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
                        <label
                          htmlFor="gen-capacity-input"
                          className="block text-slate-400 mb-1"
                        >
                          Capacidad m³ por Ubicación
                        </label>
                        <input
                          id="gen-capacity-input"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={genCapacityM3}
                          onChange={(e) =>
                            setGenCapacityM3(Number(e.target.value))
                          }
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="gen-area-name-input"
                        className="block text-xs text-slate-400 mb-1"
                      >
                        Nombre del Área / Rack
                      </label>
                      <input
                        id="gen-area-name-input"
                        type="text"
                        value={genAreaName}
                        onChange={(e) => setGenAreaName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label
                          htmlFor="gen-levels-input"
                          className="block text-slate-400 mb-1"
                        >
                          Niveles (Comas)
                        </label>
                        <input
                          id="gen-levels-input"
                          type="text"
                          value={genLevelsInput}
                          onChange={(e) => setGenLevelsInput(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold"
                        />
                      </div>

                      <div>
                        <span className="block text-slate-400 mb-1">
                          Rangos (Inicio - Fin)
                        </span>
                        <div className="flex gap-2">
                          <input
                            aria-label="Posición de Inicio"
                            type="number"
                            value={genPosStart}
                            onChange={(e) =>
                              setGenPosStart(Number(e.target.value))
                            }
                            className="w-1/2 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-white font-bold text-center"
                          />
                          <input
                            aria-label="Posición de Fin"
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
                      type="button"
                      onClick={handleGenerateBatch}
                      disabled={submitting}
                      className="w-full py-3.5 bg-amber-500 text-slate-950 font-black rounded-xl text-xs disabled:opacity-50"
                    >
                      GENERAR LOTE DE UBICACIONES
                    </button>
                  </div>

                  {/* MANTENIMIENTO MASIVO CON GUARDADO DE CAPACIDADES */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h2 className="text-base font-bold text-amber-400">
                          Mantenimiento Masivo
                        </h2>
                        <button
                          type="button"
                          onClick={handleDeleteFullWarehouse}
                          className="px-2.5 py-1 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded text-[11px] font-bold"
                        >
                          Borrar Depósito Completo
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label
                            htmlFor="filter-maint-wh-select"
                            className="block text-slate-400 mb-1 font-bold"
                          >
                            1. Filtrar Depósito
                          </label>
                          <select
                            id="filter-maint-wh-select"
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
                          <label
                            htmlFor="filter-maint-area-select"
                            className="block text-slate-400 mb-1 font-bold"
                          >
                            2. Filtrar Bloque / Área
                          </label>
                          <select
                            id="filter-maint-area-select"
                            value={selectedAreaFilter}
                            onChange={(e) => {
                              setSelectedAreaFilter(e.target.value);
                              setConfigPage(1);
                            }}
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
                          type="button"
                          onClick={handleToggleSelectAllLocations}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded-lg border border-slate-700"
                        >
                          {visibleLocationsInMaintenance.length > 0 &&
                          visibleLocationsInMaintenance.every((l) =>
                            selectedLocIdsForDelete.includes(l.id),
                          )
                            ? '☑ Desmarcar Todo'
                            : '☐ Seleccionar Todo (Visibles)'}
                        </button>
                        <span className="text-slate-400 font-bold">
                          {selectedLocIdsForDelete.length} Seleccionadas
                        </span>
                      </div>

                      <div className="space-y-2">
                        {paginatedLocations.map((loc) => {
                          const isSelected = selectedLocIdsForDelete.includes(
                            loc.id,
                          );
                          const currentCapValue =
                            editedCapacities[loc.id] !== undefined
                              ? editedCapacities[loc.id]
                              : loc.maxCapacityM3;

                          return (
                            <div
                              key={loc.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                isSelected
                                  ? 'bg-red-950/30 border-red-500'
                                  : editedCapacities[loc.id] !== undefined
                                    ? 'bg-amber-950/30 border-amber-500'
                                    : 'bg-slate-950 border-slate-800'
                              }`}
                            >
                              <label
                                htmlFor={`select-loc-checkbox-${loc.id}`}
                                className="flex items-center gap-3 cursor-pointer flex-1"
                              >
                                <input
                                  id={`select-loc-checkbox-${loc.id}`}
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedLocIdsForDelete((prev) =>
                                      prev.includes(loc.id)
                                        ? prev.filter((id) => id !== loc.id)
                                        : [...prev, loc.id],
                                    );
                                  }}
                                  aria-label={`Seleccionar ubicación ${loc.code}`}
                                  className="accent-red-500 w-4 h-4"
                                />
                                <div>
                                  <strong className="text-white block font-mono">
                                    {loc.code}
                                  </strong>
                                  <span className="text-slate-400 text-[10px]">
                                    {loc.zoneName}
                                  </span>
                                </div>
                              </label>

                              <div className="flex items-center gap-2">
                                <label
                                  htmlFor={`cap-input-${loc.id}`}
                                  className="text-[10px] text-slate-400 font-bold"
                                >
                                  Capacidad m³:
                                </label>
                                <input
                                  id={`cap-input-${loc.id}`}
                                  type="number"
                                  step="0.1"
                                  min="0.1"
                                  value={currentCapValue}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setEditedCapacities((prev) => ({
                                      ...prev,
                                      [loc.id]: val,
                                    }));
                                  }}
                                  className="w-16 bg-slate-900 border border-slate-800 px-2 py-1 rounded text-amber-400 font-bold text-center text-xs"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {visibleLocationsInMaintenance.length >
                        ITEMS_PER_PAGE && (
                        <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                          <span className="text-slate-400">
                            Pág. {configPage} de{' '}
                            {Math.ceil(
                              visibleLocationsInMaintenance.length /
                                ITEMS_PER_PAGE,
                            )}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={configPage === 1}
                              onClick={() => setConfigPage((p) => p - 1)}
                              className="px-2 py-1 bg-slate-800 text-white rounded font-bold disabled:opacity-50"
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              disabled={
                                configPage * ITEMS_PER_PAGE >=
                                visibleLocationsInMaintenance.length
                              }
                              onClick={() => setConfigPage((p) => p + 1)}
                              className="px-2 py-1 bg-slate-800 text-white rounded font-bold disabled:opacity-50"
                            >
                              Sig
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 mt-4">
                      {editedCapacitiesCount > 0 && (
                        <button
                          type="button"
                          onClick={handleSaveCapacityChanges}
                          disabled={submitting}
                          className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-lg disabled:opacity-50"
                        >
                          💾 GUARDAR {editedCapacitiesCount} CAMBIO(S) DE
                          CAPACIDAD
                        </button>
                      )}

                      {selectedLocIdsForDelete.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDeleteSelectedLocations}
                          disabled={submitting}
                          className="w-full py-3 bg-red-600 text-white font-black rounded-xl text-xs shadow-lg disabled:opacity-50"
                        >
                          ELIMINAR {selectedLocIdsForDelete.length} POSICIONES
                          SELECCIONADAS
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL DETALLE DE CONTENEDOR AUDITADO */}
        {/* ------------------------------------------------------------------ */}
        {selectedContainerDetail && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-container-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h2
                    id="modal-container-title"
                    className="text-lg font-black text-amber-400"
                  >
                    Detalle del Contenedor:{' '}
                    {selectedContainerDetail.containerNumber}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Depósito: {selectedContainerDetail.warehouseName} | Arribo:{' '}
                    {new Date(
                      selectedContainerDetail.arrivalDate,
                    ).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedContainerDetail(null)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 font-bold rounded-lg text-xs hover:bg-slate-700"
                >
                  Cerrar
                </button>
              </div>

              <div className="max-h-[350px] overflow-y-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Descripción</th>
                      <th className="p-2.5 text-center">Bultos</th>
                      <th className="p-2.5 text-center">
                        Auditado / Controlado Por
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {selectedContainerDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2.5 font-mono text-amber-400 font-bold">
                          {item.sku}
                        </td>
                        <td className="p-2.5 text-white">{item.description}</td>
                        <td className="p-2.5 text-center font-bold">
                          {item.quantityBultos}
                        </td>
                        <td className="p-2.5 text-center">
                          {item.isControlled ? (
                            <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded text-[11px]">
                              ✓ {item.controlledBy || 'Operario'} (
                              {item.controlledAt
                                ? new Date(
                                    item.controlledAt,
                                  ).toLocaleDateString('es-AR')
                                : '-'}
                              )
                            </span>
                          ) : (
                            <span className="text-amber-400 font-bold bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded text-[11px]">
                              Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL MUDANZA / REUBICACIÓN DE PALLETS */}
        {/* ------------------------------------------------------------------ */}
        {relocateItem && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-relocate-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
              <h2
                id="modal-relocate-title"
                className="text-base font-black text-amber-400 border-b border-slate-800 pb-2"
              >
                Reubicar Pallet / Mover Stock
              </h2>

              <div className="text-xs space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-white font-bold">
                  {relocateItem.productName}
                </p>
                <p className="text-amber-400 font-mono">
                  SKU: {relocateItem.productSku}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label
                    htmlFor="source-inventory-select"
                    className="block text-slate-300 mb-1 font-bold"
                  >
                    1. Seleccionar Posición Origen *
                  </label>
                  <select
                    id="source-inventory-select"
                    value={selectedSourceInventoryId}
                    onChange={(e) => {
                      const selectedInvId = e.target.value;
                      setSelectedSourceInventoryId(selectedInvId);
                      const selected = relocateItem.availableSources.find(
                        (s) => s.inventoryId === selectedInvId,
                      );
                      if (selected) {
                        setRelocateQuantity(selected.quantityBultos);
                        setRelocateTargetWarehouseId(selected.warehouseId);
                        setRelocateTargetLocId('');
                        loadLocationsForWarehouse(selected.warehouseId);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-amber-300 font-bold"
                  >
                    {relocateItem.availableSources.map((s) => (
                      <option key={s.inventoryId} value={s.inventoryId}>
                        {s.locationCode} ({s.warehouseName}) -{' '}
                        {s.quantityBultos} bu
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="relocate-quantity-input"
                    className="block text-slate-300 mb-1 font-bold"
                  >
                    2. Cantidad de Bultos a Mover *
                  </label>
                  <input
                    id="relocate-quantity-input"
                    type="number"
                    min={1}
                    value={relocateQuantity}
                    onChange={(e) =>
                      setRelocateQuantity(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-amber-300 font-bold text-center"
                  />
                </div>

                <div>
                  <label
                    htmlFor="relocate-target-warehouse-select"
                    className="block text-slate-300 mb-1 font-bold"
                  >
                    3. Depósito Destino *
                  </label>
                  <select
                    id="relocate-target-warehouse-select"
                    value={relocateTargetWarehouseId}
                    onChange={(e) => {
                      const newWhId = e.target.value;
                      setRelocateTargetWarehouseId(newWhId);
                      setRelocateTargetLocId('');
                      setRelocateSearchLocQuery('');
                      loadLocationsForWarehouse(newWhId);
                    }}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-3 text-sm text-amber-300 font-bold"
                  >
                    {simpleWarehousesList.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="relocate-target-select"
                    className="block text-slate-300 mb-1 font-bold"
                  >
                    4. Buscar y Seleccionar Posición Destino *
                  </label>
                  <input
                    type="text"
                    placeholder="🔍 Buscar por código (ej. b4, rack-2)..."
                    value={relocateSearchLocQuery}
                    onChange={(e) => setRelocateSearchLocQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white mb-2 font-mono"
                  />

                  <select
                    id="relocate-target-select"
                    value={relocateTargetLocId}
                    onChange={(e) => setRelocateTargetLocId(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-3 text-sm text-white font-bold"
                  >
                    <option value="">
                      -- Seleccionar Posición Destino (
                      {filteredRelocateLocations.length} disponibles) --
                    </option>
                    {filteredRelocateLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zoneName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleConfirmRelocation}
                  disabled={submitting}
                  className="flex-1 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs hover:bg-amber-400 disabled:opacity-50"
                >
                  CONFIRMAR REUBICACIÓN
                </button>
                <button
                  type="button"
                  onClick={() => setRelocateItem(null)}
                  className="px-4 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MODAL RÓTULO A4 */}
        {/* ------------------------------------------------------------------ */}
        <PalletLabelModal
          data={printModalData}
          onClose={() => setPrintModalData(null)}
        />
      </main>
    </ProtectedRoute>
  );
}
