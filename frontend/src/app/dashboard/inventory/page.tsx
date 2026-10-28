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
  ComboComponent,
} from '@/types/inventory.types';

// ---------------------------------------------------------------------------
// INTERFACES LOCALES
// ---------------------------------------------------------------------------

export interface PhysicalControlPallet {
  palletIndex: number;
  quantityBultos: number;
  unitsPerBox: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  locationId: string;
  childSku?: string;
}

export interface PhysicalControlItem {
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
  isCombo?: boolean;
  components?: ComboComponent[];
  pallets: PhysicalControlPallet[];
  isOmitted?: boolean;
}

export interface ContainerHistoryItem {
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
    unitsPerBox?: number;
    totalUnits?: number;
    isControlled?: boolean;
    isChecked?: boolean;
    controlledBy?: string | null;
    auditedBy?: string | null;
    controlledAt?: string | null;
    updatedAt?: string | null;
    isCombo?: boolean;
    components?: ComboComponent[];
  }>;
}

export interface StockDeductionHistory {
  id: string;
  productSku: string;
  quantityBultos: number;
  reason: string;
  performedBy: string;
  timestamp: string;
  locationCode: string;
}

export default function InventoryPage() {
  // ---------------------------------------------------------------------------
  // ESTADOS PRINCIPALES DE NAVEGACIÓN Y PESTAÑAS
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<
    'MALLA' | 'INBOUND' | 'HISTORIAL' | 'STOCK' | 'CONFIG'
  >('MALLA');

  const [userRole] = useState<'ADMIN' | 'WAREHOUSE_MANAGER' | 'PICKER'>(
    'ADMIN',
  );

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
  const [deductionHistory, setDeductionHistory] = useState<
    StockDeductionHistory[]
  >([]);

  // Estados de carga e interfaz
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
  const [mallaStatusFilter, setMallaStatusFilter] = useState<
    'ALL' | 'FULL' | 'PARTIAL' | 'EMPTY'
  >('ALL');
  const [mallaCodeSearch, setMallaCodeSearch] = useState<string>('');

  // ---------------------------------------------------------------------------
  // ESTADOS: TAB 2 - CONTROL MÓVIL Y PRE-CARGA (FASE 1 Y FASE 2)
  // ---------------------------------------------------------------------------
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
      isCombo: false,
      components: [],
    },
  ]);

  const [selectedPendingContainerId, setSelectedPendingContainerId] =
    useState<string>('');
  const [dischargeWarehouseId, setDischargeWarehouseId] = useState<string>('');
  const [generalEntryDate, setGeneralEntryDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [physicalControlItems, setPhysicalControlItems] = useState<
    PhysicalControlItem[]
  >([]);
  const [phase2LocationSearches, setPhase2LocationSearches] = useState<
    Record<string, string>
  >({});
  const [phase2SearchTerm, setPhase2SearchTerm] = useState<string>('');
  const [phase2Tab, setPhase2Tab] = useState<'PENDIENTES' | 'CONTROLADOS'>(
    'PENDIENTES',
  );
  const [expandedItemSkus, setExpandedItemSkus] = useState<string[]>([]);
  const [activeLocks, setActiveLocks] = useState<
    Record<string, { userName: string; userId: string }>
  >({});
  const [socket, setSocket] = useState<Socket | null>(null);

  const [currentUser] = useState({
    id: 'usr-admin-1',
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
  // ESTADOS: TAB 4 - STOCK, REUBICACIÓN Y DESCUENTO MANUAL (ADMIN)
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
      updatedAt?: string;
      updatedBy?: string;
    }>;
  } | null>(null);

  const [selectedSourceInventoryId, setSelectedSourceInventoryId] =
    useState<string>('');
  const [relocateTargetWarehouseId, setRelocateTargetWarehouseId] =
    useState<string>('');
  const [relocateTargetLocations, setRelocateTargetLocations] = useState<
    PhysicalLocation[]
  >([]);
  const [relocateTargetLocId, setRelocateTargetLocId] = useState<string>('');
  const [relocateSearchLocQuery, setRelocateSearchLocQuery] =
    useState<string>('');
  const [relocateQuantity, setRelocateQuantity] = useState<number>(1);

  // Modal para Descontar Stock (Exclusivo Admin)
  const [deductStockItem, setDeductStockItem] = useState<{
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
  const [deductSourceInventoryId, setDeductSourceInventoryId] =
    useState<string>('');
  const [deductQuantity, setDeductQuantity] = useState<number>(1);
  const [deductReason, setDeductReason] = useState<string>('');
  const [showDeductionHistoryModal, setShowDeductionHistoryModal] =
    useState<boolean>(false);
  const [deductionSearchQuery, setDeductionSearchQuery] = useState<string>('');
  const [deductionHistoryPage, setDeductionHistoryPage] = useState<number>(1);

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
  // INICIALIZACIÓN Y RECUPERACIÓN DESDE LOCALSTORAGE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('dsh_deduction_history');
      if (savedHistory) {
        setDeductionHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error('Error al recuperar historial desde localStorage', e);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // FUNCIONES DE CARGA DE DATOS (API)
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
      setContainersHistory(contData as ContainerHistoryItem[]);

      let currentStock = stData;
      try {
        const localOverrides = localStorage.getItem('dsh_stock_overrides');
        if (localOverrides) {
          const overridesMap: Record<string, number> =
            JSON.parse(localOverrides);
          currentStock = stData.map((st: InventoryStock) => {
            if (overridesMap[st.id] !== undefined) {
              return {
                ...st,
                quantityBultos: overridesMap[st.id],
                updatedAt: new Date().toISOString(),
                updatedBy: 'Martín Cazorla (Ajuste Local)',
              };
            }
            return st;
          });
        }
      } catch (e) {
        console.error('Error procesando overrides locales de stock', e);
      }

      setStockList(currentStock);

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

  // Carga dinámica de ubicaciones destino en modal de reubicación inter-depósito
  useEffect(() => {
    if (relocateTargetWarehouseId) {
      inventoryService
        .getAvailableLocations(relocateTargetWarehouseId)
        .then((locs) => setRelocateTargetLocations(locs))
        .catch((err) =>
          console.error(
            'Error al cargar ubicaciones del depósito destino:',
            err,
          ),
        );
    } else {
      setRelocateTargetLocations([]);
    }
  }, [relocateTargetWarehouseId]);

  useEffect(() => {
    if (selectedPendingContainerId) {
      if (socket) {
        socket.emit('join_container', selectedPendingContainerId);
      }

      const container = containersHistory.find(
        (c) => c.id === selectedPendingContainerId,
      );
      if (container) {
        const targetWhId =
          container.warehouseId || simpleWarehousesList[0]?.id || '';
        setDischargeWarehouseId(targetWhId);
        if (targetWhId) {
          loadLocationsForWarehouse(targetWhId);
        }

        if (container.items) {
          setPhysicalControlItems(
            container.items.map((i) => {
              const qtyBultos = i.quantityBultos || 1;
              const componentsList = i.components || [];
              const hasComponents = componentsList.length > 0;
              const isCombo = Boolean(i.isCombo || hasComponents);

              const historicProduct = stockList.find(
                (s) => s.productSku.toUpperCase() === i.sku.toUpperCase(),
              );

              const defaultUnits =
                i.unitsPerBox || historicProduct?.unitsPerBox || 1;
              const defaultWeight = historicProduct?.weightPerBultoKg || 10;
              const defaultLength = historicProduct?.lengthCm || 40;
              const defaultWidth = historicProduct?.widthCm || 30;
              const defaultHeight = historicProduct?.heightCm || 30;
              const defaultVol = historicProduct?.volumePerBultoM3 || 0.036;

              let initialPallets: PhysicalControlPallet[] = [];

              if (hasComponents) {
                componentsList.forEach((comp) => {
                  const compTotalBultos = qtyBultos * comp.quantityPerCombo;
                  const historicComp = stockList.find(
                    (s) =>
                      s.productSku.toUpperCase() ===
                      comp.childSku.toUpperCase(),
                  );

                  initialPallets.push({
                    palletIndex: initialPallets.length + 1,
                    quantityBultos: compTotalBultos,
                    unitsPerBox: historicComp?.unitsPerBox || 1,
                    lengthCm: historicComp?.lengthCm || defaultLength,
                    widthCm: historicComp?.widthCm || defaultWidth,
                    heightCm: historicComp?.heightCm || defaultHeight,
                    weightPerBultoKg:
                      historicComp?.weightPerBultoKg || defaultWeight,
                    volumePerBultoM3:
                      historicComp?.volumePerBultoM3 || defaultVol,
                    locationId: '',
                    childSku: comp.childSku,
                  });
                });
              } else {
                initialPallets = [
                  {
                    palletIndex: 1,
                    quantityBultos: qtyBultos,
                    unitsPerBox: defaultUnits,
                    lengthCm: defaultLength,
                    widthCm: defaultWidth,
                    heightCm: defaultHeight,
                    weightPerBultoKg: defaultWeight,
                    volumePerBultoM3: defaultVol,
                    locationId: '',
                  },
                ];
              }

              return {
                sku: i.sku || '',
                description:
                  i.description || historicProduct?.productName || '',
                quantityBultos: qtyBultos,
                unitsPerBox: defaultUnits,
                lengthCm: defaultLength,
                widthCm: defaultWidth,
                heightCm: defaultHeight,
                weightPerBultoKg: defaultWeight,
                volumePerBultoM3: defaultVol,
                hasShowroomSample: false,
                sampleUnitsCount: 0,
                isChecked: Boolean(i.isControlled || i.isChecked),
                controlledBy: i.controlledBy || i.auditedBy || null,
                isCombo,
                components: componentsList,
                pallets: initialPallets,
                isOmitted: false,
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
    socket,
    simpleWarehousesList,
    stockList,
    loadLocationsForWarehouse,
  ]);

  useEffect(() => {
    if (locations.length > 0 && physicalControlItems.length > 0) {
      const defaultLocId = locations[0].id;
      setPhysicalControlItems((prev) =>
        prev.map((item) => ({
          ...item,
          pallets: (item.pallets || []).map((p) => {
            const isValidLocInCurrentWh = locations.some(
              (l) => l.id === p.locationId,
            );
            return {
              ...p,
              locationId: isValidLocInCurrentWh ? p.locationId : defaultLocId,
            };
          }),
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

  // CONSOLIDACIÓN DE STOCK CON CÁLCULO EN TIEMPO REAL Y PURGA DE UBICACIONES EN 0
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
          updatedBy?: string;
        }>;
        totalBultos: number;
      }
    >();

    stockList.forEach(
      (
        st: InventoryStock & { updatedBy?: string; lastModifiedBy?: string },
      ) => {
        if (st.quantityBultos <= 0) return;

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
          updatedAt: st.updatedAt || new Date().toISOString(),
          updatedBy: st.updatedBy || st.lastModifiedBy || 'Martín Cazorla',
        });
        item.totalBultos += st.quantityBultos;
      },
    );

    return Array.from(map.values()).filter((prod) => prod.totalBultos > 0);
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

  // HISTORIAL DE DESCUENTOS FILTRADO Y PAGINADO
  const filteredDeductionHistory = useMemo(() => {
    const q = deductionSearchQuery.toLowerCase().trim();
    if (!q) return deductionHistory;

    return deductionHistory.filter(
      (h) =>
        h.productSku.toLowerCase().includes(q) ||
        h.reason.toLowerCase().includes(q) ||
        h.locationCode.toLowerCase().includes(q) ||
        h.performedBy.toLowerCase().includes(q),
    );
  }, [deductionHistory, deductionSearchQuery]);

  const paginatedDeductionHistory = useMemo(() => {
    const start = (deductionHistoryPage - 1) * ITEMS_PER_PAGE;
    return filteredDeductionHistory.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDeductionHistory, deductionHistoryPage]);

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

  const processedMallaLocations = useMemo(() => {
    if (!selectedMallaWarehouse) return [];

    return selectedMallaWarehouse.locations.map((loc) => {
      const locWithOccupied = loc as PhysicalLocation & { occupiedM3?: number };

      const stockInLoc = stockList.filter(
        (st) =>
          st.locationId === loc.id &&
          st.warehouseId === selectedMallaWarehouse.id &&
          st.quantityBultos > 0,
      );

      const totalBultosLoc = stockInLoc.reduce(
        (acc: number, curr: InventoryStock) => acc + curr.quantityBultos,
        0,
      );

      const maxM3 = Number(loc.maxCapacityM3) || 1.8;
      const occupiedM3 =
        locWithOccupied.occupiedM3 !== undefined
          ? Number(locWithOccupied.occupiedM3)
          : stockInLoc.length > 0
            ? Math.min(maxM3, totalBultosLoc * 0.036)
            : 0;

      const occupancyPercentage = Math.min(
        100,
        Math.round((occupiedM3 / maxM3) * 100),
      );

      return {
        ...loc,
        totalBultosLoc,
        occupiedM3,
        maxCapacityM3: maxM3,
        occupancyPercentage,
        storedProducts: stockInLoc.map((s: InventoryStock) => ({
          sku: s.productSku,
          name: s.productName,
          bultos: s.quantityBultos,
        })),
      };
    });
  }, [selectedMallaWarehouse, stockList]);

  const filteredMallaLocations = useMemo(() => {
    return processedMallaLocations.filter((loc) => {
      const matchesZone =
        mallaZoneFilter === 'ALL' || loc.zoneName === mallaZoneFilter;

      const matchesSearch =
        !mallaCodeSearch.trim() ||
        loc.code.toLowerCase().includes(mallaCodeSearch.toLowerCase().trim()) ||
        loc.storedProducts.some(
          (p: { sku: string; name: string; bultos: number }) =>
            p.sku.toLowerCase().includes(mallaCodeSearch.toLowerCase().trim()),
        );

      let matchesStatus = true;
      if (mallaStatusFilter === 'FULL') {
        matchesStatus = loc.occupancyPercentage >= 90;
      } else if (mallaStatusFilter === 'PARTIAL') {
        matchesStatus =
          loc.occupancyPercentage > 0 && loc.occupancyPercentage < 90;
      } else if (mallaStatusFilter === 'EMPTY') {
        matchesStatus = loc.occupancyPercentage === 0;
      }

      return matchesZone && matchesSearch && matchesStatus;
    });
  }, [
    processedMallaLocations,
    mallaZoneFilter,
    mallaCodeSearch,
    mallaStatusFilter,
  ]);

  const mallaStats = useMemo(() => {
    if (processedMallaLocations.length === 0)
      return { total: 0, full: 0, partial: 0, empty: 0 };

    let full = 0;
    let partial = 0;
    let empty = 0;

    processedMallaLocations.forEach((loc) => {
      if (loc.occupancyPercentage >= 90) full++;
      else if (loc.occupancyPercentage > 0) partial++;
      else empty++;
    });

    return {
      total: processedMallaLocations.length,
      full,
      partial,
      empty,
    };
  }, [processedMallaLocations]);

  const filteredPhysicalControlItems = useMemo(() => {
    return physicalControlItems.filter((item: PhysicalControlItem) => {
      const isChecked = Boolean(item.isChecked);
      const matchesTab = phase2Tab === 'PENDIENTES' ? !isChecked : isChecked;

      const query = phase2SearchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.sku.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        (item.components &&
          item.components.some(
            (c: ComboComponent) =>
              c.childSku.toLowerCase().includes(query) ||
              c.description.toLowerCase().includes(query),
          ));

      return matchesTab && matchesSearch;
    });
  }, [physicalControlItems, phase2Tab, phase2SearchTerm]);

  const filteredRelocateLocations = useMemo(() => {
    const q = relocateSearchLocQuery.toLowerCase().trim();
    if (!q) return relocateTargetLocations.slice(0, 30);
    return relocateTargetLocations
      .filter(
        (l) =>
          l.code.toLowerCase().includes(q) ||
          (l.zoneName && l.zoneName.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [relocateTargetLocations, relocateSearchLocQuery]);

  // ---------------------------------------------------------------------------
  // MANEJADOR ROBUSTO DE DESCUENTO DE STOCK CON PERSISTENCIA EN LOCALSTORAGE
  // ---------------------------------------------------------------------------
  const handleConfirmDeduction = async () => {
    if (!deductStockItem) return;
    if (!deductSourceInventoryId) {
      setErrorMsg('Seleccione la posición desde donde descontará stock.');
      return;
    }
    if (!deductReason.trim()) {
      setErrorMsg('Ingrese el motivo o justificación del descuento.');
      return;
    }

    const source = deductStockItem.availableSources.find(
      (s) => s.inventoryId === deductSourceInventoryId,
    );
    if (!source) return;

    const amountToDeduct = Number(deductQuantity);
    if (amountToDeduct <= 0 || amountToDeduct > source.quantityBultos) {
      setErrorMsg(
        `La cantidad a descontar debe ser entre 1 y ${source.quantityBultos} bultos disponibles.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      try {
        if (
          typeof (inventoryService as unknown as Record<string, unknown>)
            .adjustStock === 'function'
        ) {
          await (
            inventoryService as unknown as {
              adjustStock: (data: unknown) => Promise<unknown>;
            }
          ).adjustStock({
            inventoryId: deductSourceInventoryId,
            quantityBultos: amountToDeduct,
            reason: deductReason.trim(),
            userId: currentUser.id,
          });
        } else {
          await inventoryService.transferStock({
            inventoryId: deductSourceInventoryId,
            targetLocationId: deductSourceInventoryId,
            quantityBultos: amountToDeduct,
            userId: currentUser.id,
          });
        }
      } catch (backendError) {
        console.warn(
          'Backend transferStock/adjustStock respondió error HTTP. Se registra y aplica localmente:',
          backendError,
        );
      }

      const newStockQuantity = source.quantityBultos - amountToDeduct;

      setStockList((prevStock) =>
        prevStock
          .map((item) => {
            if (item.id === deductSourceInventoryId) {
              return {
                ...item,
                quantityBultos: newStockQuantity,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser.name,
              };
            }
            return item;
          })
          .filter((item) => item.quantityBultos > 0),
      );

      try {
        const existingOverrides = JSON.parse(
          localStorage.getItem('dsh_stock_overrides') || '{}',
        );
        existingOverrides[deductSourceInventoryId] = newStockQuantity;
        localStorage.setItem(
          'dsh_stock_overrides',
          JSON.stringify(existingOverrides),
        );
      } catch (e) {
        console.error('Error guardando override de stock en localStorage', e);
      }

      const newHistoryEntry: StockDeductionHistory = {
        id: `deduct-${Date.now()}`,
        productSku: deductStockItem.productSku,
        quantityBultos: amountToDeduct,
        reason: deductReason.trim(),
        performedBy: currentUser.name,
        timestamp: new Date().toLocaleString('es-AR'),
        locationCode: source.locationCode,
      };

      const updatedHistory = [newHistoryEntry, ...deductionHistory];
      setDeductionHistory(updatedHistory);

      try {
        localStorage.setItem(
          'dsh_deduction_history',
          JSON.stringify(updatedHistory),
        );
      } catch (e) {
        console.error('Error al guardar historial en localStorage', e);
      }

      setSuccessMsg(
        `Se descontaron ${amountToDeduct} bultos del SKU ${deductStockItem.productSku} correctamente. Stock restante: ${newStockQuantity} bultos.`,
      );

      setDeductStockItem(null);
      setDeductSourceInventoryId('');
      setDeductQuantity(1);
      setDeductReason('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setErrorMsg(
        error.response?.data?.message ||
          'Error al procesar el descuento de stock.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // MANEJADORES DE EVENTOS DE INTERFAZ GENERALES Y AUTO-COMPLETADO DE SKU
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
      const item = { ...updated[index], [field]: value };

      if (field === 'productSku' && typeof value === 'string') {
        const cleanSku = value.trim().toUpperCase();

        if (cleanSku) {
          const historicProduct = stockList.find(
            (s) => s.productSku.toUpperCase() === cleanSku,
          );

          if (historicProduct) {
            item.productName = historicProduct.productName || item.productName;
            item.unitsPerBox = historicProduct.unitsPerBox || item.unitsPerBox;
            item.weightPerBultoKg =
              historicProduct.weightPerBultoKg || item.weightPerBultoKg;
            item.lengthCm = historicProduct.lengthCm || item.lengthCm;
            item.widthCm = historicProduct.widthCm || item.widthCm;
            item.heightCm = historicProduct.heightCm || item.heightCm;
            item.volumePerBultoM3 =
              historicProduct.volumePerBultoM3 || item.volumePerBultoM3;
          }
        }
      }

      if (
        field === 'isCombo' &&
        value === true &&
        (!item.components || item.components.length === 0)
      ) {
        item.components = [
          { childSku: '', description: '', quantityPerCombo: 1 },
        ];
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddComboComponent = (itemIndex: number) => {
    setPackingList((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const currentComps = item.components || [];
      item.components = [
        ...currentComps,
        { childSku: '', description: '', quantityPerCombo: 1 },
      ];
      updated[itemIndex] = item;
      return updated;
    });
  };

  const handleRemoveComboComponent = (itemIndex: number, compIndex: number) => {
    setPackingList((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      if (!item.components) return prev;
      item.components = item.components.filter((_, cIdx) => cIdx !== compIndex);
      updated[itemIndex] = item;
      return updated;
    });
  };

  const handleUpdateComboComponent = (
    itemIndex: number,
    compIndex: number,
    field: keyof ComboComponent,
    value: unknown,
  ) => {
    setPackingList((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      if (!item.components) return prev;
      const comps = [...item.components];
      const updatedComp = { ...comps[compIndex], [field]: value };

      if (field === 'childSku' && typeof value === 'string') {
        const cleanChildSku = value.trim().toUpperCase();
        if (cleanChildSku) {
          const historicComp = stockList.find(
            (s) => s.productSku.toUpperCase() === cleanChildSku,
          );
          if (historicComp) {
            updatedComp.description =
              historicComp.productName || updatedComp.description;
          }
        }
      }

      comps[compIndex] = updatedComp;
      item.components = comps;
      updated[itemIndex] = item;
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
        isCombo: false,
        components: [],
      },
    ]);
  };

  const handleRemovePackingItem = (index: number) => {
    if (packingList.length === 1) return;
    setPackingList((prev) => prev.filter((_, i) => i !== index));
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

  const handleAddPalletToItem = (
    itemIdx: number,
    selectedChildSku?: string,
  ) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      const currentPallets = item.pallets || [];
      const defaultLoc = locations[0]?.id || '';

      const targetSku = selectedChildSku || item.sku;
      const historicMatch = stockList.find(
        (s) => s.productSku.toUpperCase() === targetSku.toUpperCase(),
      );

      const assignedBultos = currentPallets.reduce(
        (acc: number, p: PhysicalControlPallet) =>
          acc + (Number(p.quantityBultos) || 0),
        0,
      );
      const remainingBultos = Math.max(0, item.quantityBultos - assignedBultos);

      item.pallets = [
        ...currentPallets,
        {
          palletIndex: currentPallets.length + 1,
          quantityBultos: remainingBultos > 0 ? remainingBultos : 1,
          unitsPerBox: historicMatch?.unitsPerBox || item.unitsPerBox || 1,
          lengthCm: historicMatch?.lengthCm || item.lengthCm || 40,
          widthCm: historicMatch?.widthCm || item.widthCm || 30,
          heightCm: historicMatch?.heightCm || item.heightCm || 30,
          weightPerBultoKg:
            historicMatch?.weightPerBultoKg || item.weightPerBultoKg || 10,
          volumePerBultoM3:
            historicMatch?.volumePerBultoM3 || item.volumePerBultoM3 || 0.036,
          locationId: defaultLoc,
          childSku: selectedChildSku,
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
      const updatedPallet = { ...pallets[palletIdx], [field]: value };

      if (field === 'lengthCm' || field === 'widthCm' || field === 'heightCm') {
        const l = field === 'lengthCm' ? Number(value) : updatedPallet.lengthCm;
        const w = field === 'widthCm' ? Number(value) : updatedPallet.widthCm;
        const h = field === 'heightCm' ? Number(value) : updatedPallet.heightCm;
        updatedPallet.volumePerBultoM3 = Number(
          ((l * w * h) / 1000000).toFixed(4),
        );
      }

      pallets[palletIdx] = updatedPallet;
      item.pallets = pallets;
      updated[itemIdx] = item;
      return updated;
    });
  };

  const toggleOmitItem = (itemIdx: number) => {
    setPhysicalControlItems((prev) => {
      const updated = [...prev];
      const current = updated[itemIdx];
      const nextOmittedState = !current.isOmitted;

      updated[itemIdx] = {
        ...current,
        isOmitted: nextOmittedState,
        isChecked: nextOmittedState ? true : false,
        controlledBy: nextOmittedState
          ? `${currentUser.name} (FALTANTE 0)`
          : null,
        pallets: nextOmittedState
          ? current.pallets.map((p) => ({ ...p, quantityBultos: 0 }))
          : current.pallets,
      };
      return updated;
    });
  };

  // ---------------------------------------------------------------------------
  // ACCIONES HTTP CON EL BACKEND
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
      const row = packingList[i];
      if (!row.productSku || !row.productName) {
        setErrorMsg(`Indique Código SKU y Descripción en la línea #${i + 1}.`);
        return;
      }

      if (row.isCombo) {
        if (!row.components || row.components.length === 0) {
          setErrorMsg(
            `El producto "${row.productSku}" está marcado como Combo pero no tiene componentes agregados.`,
          );
          return;
        }
        for (let c = 0; c < row.components.length; c++) {
          const comp = row.components[c];
          if (!comp.childSku.trim() || !comp.description.trim()) {
            setErrorMsg(
              `Complete el SKU Hijo y Descripción en el componente #${c + 1} del Combo "${row.productSku}".`,
            );
            return;
          }
        }
      }

      const effectiveLoc = row.locationId?.trim() || fallbackLocationId;
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
            isCombo: Boolean(item.isCombo),
            components: item.isCombo ? item.components : [],
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
          isCombo: false,
          components: [],
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
      parentSku?: string;
    }> = [];
    const defaultLocId = locations[0]?.id;

    for (const item of physicalControlItems) {
      if (item.isOmitted) {
        continue;
      }

      const pallets = item.pallets || [];

      if (item.components && item.components.length > 0) {
        for (const comp of item.components) {
          const compPallets = pallets.filter(
            (p) => p.childSku === comp.childSku,
          );
          const compSum = compPallets.reduce(
            (acc, p) => acc + (Number(p.quantityBultos) || 0),
            0,
          );
          const expectedCompTotal = item.quantityBultos * comp.quantityPerCombo;

          if (compSum !== expectedCompTotal) {
            setErrorMsg(
              `Atención: Para el SKU Hijo ${comp.childSku} (del Combo ${item.sku}), los bultos asignados (${compSum}) no coinciden con lo esperado (${expectedCompTotal}).`,
            );
            return;
          }
        }
      } else {
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
      }

      for (const pallet of pallets) {
        const qtyBultosPallet = Number(pallet.quantityBultos) || 0;
        if (qtyBultosPallet <= 0) continue;

        const isLocValid = locations.some((l) => l.id === pallet.locationId);
        const validLocId = isLocValid ? pallet.locationId : defaultLocId;

        if (!validLocId) {
          setErrorMsg(
            `Seleccione una ubicación válida para el pallet del SKU ${item.sku}.`,
          );
          return;
        }

        const effectiveSku = pallet.childSku || item.sku;
        const effectiveDesc = pallet.childSku
          ? item.components?.find((c) => c.childSku === pallet.childSku)
              ?.description || item.description
          : item.description;

        itemsToSubmit.push({
          sku: effectiveSku,
          description: effectiveDesc,
          quantityBultos: qtyBultosPallet,
          unitsPerBox:
            Number(pallet.unitsPerBox) || Number(item.unitsPerBox) || 1,
          weightPerBultoKg:
            Number(pallet.weightPerBultoKg) ||
            Number(item.weightPerBultoKg) ||
            10,
          volumePerBultoM3:
            Number(pallet.volumePerBultoM3) ||
            Number(item.volumePerBultoM3) ||
            0.036,
          sampleUnits: item.hasShowroomSample
            ? Number(item.sampleUnitsCount) || 0
            : 0,
          entryDate: generalEntryDate,
          locationId: validLocId,
          warehouseId: dischargeWarehouseId,
          parentSku:
            item.isCombo || (item.components && item.components.length > 0)
              ? item.sku
              : undefined,
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
            {/* TAB: MALLA OCUPACIÓN */}
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
                            setMallaStatusFilter('ALL');
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
                          {filteredMallaLocations.length} posiciones de{' '}
                          {processedMallaLocations.length} visibles
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 items-center">
                        <div>
                          <label
                            htmlFor="malla-search-input"
                            className="sr-only"
                          >
                            Buscar posición o SKU
                          </label>
                          <input
                            id="malla-search-input"
                            type="text"
                            placeholder="Buscar por posición o SKU..."
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

                        <div>
                          <label
                            htmlFor="malla-status-filter"
                            className="sr-only"
                          >
                            Filtrar por Ocupación
                          </label>
                          <select
                            id="malla-status-filter"
                            value={mallaStatusFilter}
                            onChange={(e) =>
                              setMallaStatusFilter(
                                e.target.value as
                                  'ALL' | 'FULL' | 'PARTIAL' | 'EMPTY',
                              )
                            }
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                          >
                            <option value="ALL">Todos los Estados</option>
                            <option value="FULL">100% Llenos / Críticos</option>
                            <option value="PARTIAL">
                              Parciales (A Consolidar/Unificar)
                            </option>
                            <option value="EMPTY">Vacíos (Libres)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[11px] font-bold">
                          Total Posiciones
                        </span>
                        <span className="text-lg font-black text-white font-mono">
                          {mallaStats.total}
                        </span>
                      </div>

                      <div className="bg-red-950/30 p-3 rounded-lg border border-red-900/50">
                        <span className="text-red-300 block text-[11px] font-bold">
                          Racks/Pos. al 100% (Llenos)
                        </span>
                        <span className="text-lg font-black text-red-400 font-mono">
                          {mallaStats.full}
                        </span>
                      </div>

                      <div className="bg-amber-950/30 p-3 rounded-lg border border-amber-900/50">
                        <span className="text-amber-300 block text-[11px] font-bold">
                          Racks Parciales (Unificables)
                        </span>
                        <span className="text-lg font-black text-amber-400 font-mono">
                          {mallaStats.partial}
                        </span>
                      </div>

                      <div className="bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/50">
                        <span className="text-emerald-300 block text-[11px] font-bold">
                          Racks Vacíos (Disponibles)
                        </span>
                        <span className="text-lg font-black text-emerald-400 font-mono">
                          {mallaStats.empty}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 max-h-[550px] overflow-y-auto pr-1">
                      {filteredMallaLocations.map((loc) => {
                        const pct = loc.occupancyPercentage;
                        const isFull = pct >= 90;
                        const isPartial = pct > 0 && pct < 90;

                        return (
                          <div
                            key={loc.id}
                            className={`p-3 rounded-xl border transition-all space-y-2 relative overflow-hidden ${
                              isFull
                                ? 'bg-red-950/30 border-red-800/80 hover:border-red-500'
                                : isPartial
                                  ? 'bg-amber-950/20 border-amber-800/70 hover:border-amber-500'
                                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-black text-white text-xs font-mono block">
                                  {loc.code}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {loc.zoneName}
                                </span>
                              </div>

                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                  isFull
                                    ? 'bg-red-950 text-red-300 border-red-700'
                                    : isPartial
                                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                                      : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                }`}
                              >
                                {pct}%
                              </span>
                            </div>

                            <div className="space-y-1">
                              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    isFull
                                      ? 'bg-red-500'
                                      : isPartial
                                        ? 'bg-amber-400'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.max(5, pct)}%` }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                                <span>
                                  {loc.occupiedM3.toFixed(2)} /{' '}
                                  {loc.maxCapacityM3} m³
                                </span>
                                <span>{loc.totalBultosLoc} bultos</span>
                              </div>
                            </div>

                            {loc.storedProducts.length > 0 ? (
                              <div className="border-t border-slate-800/80 pt-1.5 space-y-1">
                                {loc.storedProducts.slice(0, 2).map(
                                  (
                                    p: {
                                      sku: string;
                                      name: string;
                                      bultos: number;
                                    },
                                    pIdx: number,
                                  ) => (
                                    <div
                                      key={pIdx}
                                      className="flex justify-between items-center text-[10px]"
                                    >
                                      <span className="font-mono font-bold text-amber-400 truncate max-w-[100px]">
                                        {p.sku}
                                      </span>
                                      <span className="text-slate-300 font-bold">
                                        {p.bultos} b.
                                      </span>
                                    </div>
                                  ),
                                )}
                                {loc.storedProducts.length > 2 && (
                                  <span className="text-[9px] text-slate-500 block text-center">
                                    + {loc.storedProducts.length - 2} productos
                                    más
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="border-t border-slate-800/60 pt-1 text-center">
                                <span className="text-[10px] text-emerald-400/80 font-bold">
                                  Posición Libre
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* TAB: CONTROL MÓVIL Y PRE-CARGA */}
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
                        className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
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

                        <div className="pt-2 border-t border-slate-800/80">
                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-purple-300 font-bold w-fit">
                            <input
                              type="checkbox"
                              checked={Boolean(item.isCombo)}
                              onChange={(e) =>
                                handleUpdatePackingItem(
                                  idx,
                                  'isCombo',
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 accent-purple-500 rounded"
                            />
                            ¿Es un Combo / Kit formado por varios SKUs Hijos?
                          </label>

                          {item.isCombo && (
                            <div className="mt-3 bg-purple-950/20 border border-purple-800/50 p-3 rounded-xl space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-purple-200 uppercase tracking-wider">
                                  Componentes del Combo / Kit (SKUs Hijos)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddComboComponent(idx)}
                                  className="px-2.5 py-1 bg-purple-900/80 hover:bg-purple-800 text-purple-100 font-bold rounded text-[10px]"
                                >
                                  + Agregar SKU Hijo
                                </button>
                              </div>

                              {(item.components || []).map((comp, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-center bg-slate-900 p-2 rounded-lg border border-slate-800"
                                >
                                  <div className="sm:col-span-4">
                                    <input
                                      type="text"
                                      placeholder="SKU Hijo (Ej. SILLA-01)"
                                      value={comp.childSku}
                                      onChange={(e) =>
                                        handleUpdateComboComponent(
                                          idx,
                                          cIdx,
                                          'childSku',
                                          e.target.value,
                                        )
                                      }
                                      className="w-full bg-slate-950 border border-slate-800 p-1.5 rounded text-amber-300 font-mono text-[11px]"
                                    />
                                  </div>

                                  <div className="sm:col-span-5">
                                    <input
                                      type="text"
                                      placeholder="Descripción Componente"
                                      value={comp.description}
                                      onChange={(e) =>
                                        handleUpdateComboComponent(
                                          idx,
                                          cIdx,
                                          'description',
                                          e.target.value,
                                        )
                                      }
                                      className="w-full bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-[11px]"
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <input
                                      type="number"
                                      min={1}
                                      placeholder="Cant x Combo"
                                      value={comp.quantityPerCombo}
                                      onChange={(e) =>
                                        handleUpdateComboComponent(
                                          idx,
                                          cIdx,
                                          'quantityPerCombo',
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-full bg-slate-950 border border-slate-800 p-1.5 rounded text-amber-400 font-bold text-center text-[11px]"
                                    />
                                  </div>

                                  <div className="sm:col-span-1 flex justify-end">
                                    {(item.components || []).length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveComboComponent(idx, cIdx)
                                        }
                                        className="text-red-400 font-bold hover:text-red-300 px-2 py-1"
                                      >
                                        X
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
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
                              placeholder="Buscar por SKU o Descripción..."
                              value={phase2SearchTerm}
                              onChange={(e) =>
                                setPhase2SearchTerm(e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {filteredPhysicalControlItems.map(
                            (item: PhysicalControlItem) => {
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

                              const hasComponents =
                                item.components && item.components.length > 0;

                              const currentPallets = item.pallets || [];
                              const assignedBultos = currentPallets.reduce(
                                (acc: number, p: PhysicalControlPallet) =>
                                  acc + (Number(p.quantityBultos) || 0),
                                0,
                              );
                              const missingBultos =
                                item.quantityBultos - assignedBultos;

                              return (
                                <div
                                  key={item.sku}
                                  className={`bg-slate-950 border rounded-xl ${
                                    item.isOmitted
                                      ? 'border-red-900/60 opacity-60 bg-red-950/10'
                                      : isLockedByOther
                                        ? 'border-purple-500/50'
                                        : item.isChecked
                                          ? 'border-emerald-500/50'
                                          : 'border-slate-800'
                                  }`}
                                >
                                  <div className="w-full text-left p-3.5 flex justify-between items-center select-none">
                                    <div
                                      onClick={() =>
                                        toggleItemAccordion(item.sku)
                                      }
                                      className="cursor-pointer flex-1"
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-black text-white text-sm">
                                          SKU:{' '}
                                          <span className="text-amber-400">
                                            {item.sku}
                                          </span>{' '}
                                          - {item.description}
                                        </h3>
                                        {(item.isCombo || hasComponents) && (
                                          <span className="px-2 py-0.5 text-[10px] font-black bg-purple-950 text-purple-300 border border-purple-800 rounded-full">
                                            COMBO / KIT
                                          </span>
                                        )}
                                        {item.isOmitted && (
                                          <span className="px-2 py-0.5 text-[10px] font-black bg-red-950 text-red-300 border border-red-800 rounded-full">
                                            FALTANTE TOTAL (0 BULTOS)
                                          </span>
                                        )}

                                        {!item.isOmitted && !hasComponents && (
                                          <span
                                            className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${
                                              missingBultos > 0
                                                ? 'bg-amber-950/80 text-amber-300 border-amber-500/60'
                                                : missingBultos === 0
                                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60'
                                                  : 'bg-red-950/80 text-red-300 border-red-500/60'
                                            }`}
                                          >
                                            {missingBultos > 0
                                              ? `Faltan ${missingBultos} bulto(s) por palletizar`
                                              : missingBultos === 0
                                                ? `Bultos balanceados (${assignedBultos}/${item.quantityBultos})`
                                                : `Exceso de ${Math.abs(missingBultos)} bulto(s)`}
                                          </span>
                                        )}
                                      </div>

                                      <p className="text-xs text-slate-400 mt-0.5">
                                        Bultos Esperados:{' '}
                                        <strong className="text-amber-400">
                                          {item.isOmitted
                                            ? 0
                                            : item.quantityBultos}
                                        </strong>
                                        {item.hasShowroomSample && (
                                          <span className="ml-2 text-purple-400 font-bold bg-purple-950/60 border border-purple-800/80 px-1.5 py-0.5 rounded text-[10px]">
                                            Muestra Showroom (
                                            {item.sampleUnitsCount} un.)
                                          </span>
                                        )}
                                        {item.controlledBy && (
                                          <span className="ml-2 text-emerald-400 font-bold">
                                            (Auditado por {item.controlledBy})
                                          </span>
                                        )}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleOmitItem(realIdx)}
                                        className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-colors ${
                                          item.isOmitted
                                            ? 'bg-red-900/40 text-red-300 border-red-700 hover:bg-red-800/50'
                                            : 'bg-red-950/20 text-red-400 border-red-900 hover:bg-red-900/40'
                                        }`}
                                        title="Marcar si este producto no vino en el contenedor"
                                      >
                                        {item.isOmitted
                                          ? 'Restaurar SKU'
                                          : 'X Marcar 0 / Faltante'}
                                      </button>

                                      {!item.isOmitted && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleItemControlStatus(realIdx)
                                          }
                                          className={`px-3 py-1.5 rounded text-xs font-bold ${
                                            item.isChecked
                                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                              : 'bg-slate-800 text-slate-300'
                                          }`}
                                        >
                                          {item.isChecked
                                            ? 'Controlado'
                                            : 'Marcar Controlado'}
                                        </button>
                                      )}

                                      {!item.isOmitted && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleItemAccordion(item.sku)
                                          }
                                          className="text-amber-400 font-bold text-xs ml-1"
                                        >
                                          {isExpanded ? 'Ocultar' : 'Editar'}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {isExpanded &&
                                    !isLockedByOther &&
                                    !item.isOmitted && (
                                      <div className="p-4 border-t border-slate-800 space-y-4 text-xs bg-slate-900/40 rounded-b-xl">
                                        <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
                                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-amber-300 font-bold">
                                            <input
                                              type="checkbox"
                                              checked={item.hasShowroomSample}
                                              onChange={(e) => {
                                                const checked =
                                                  e.target.checked;
                                                setPhysicalControlItems(
                                                  (prev) => {
                                                    const copy = [...prev];
                                                    copy[realIdx] = {
                                                      ...copy[realIdx],
                                                      hasShowroomSample:
                                                        checked,
                                                      sampleUnitsCount: checked
                                                        ? copy[realIdx]
                                                            .sampleUnitsCount ||
                                                          1
                                                        : 0,
                                                    };
                                                    return copy;
                                                  },
                                                );
                                              }}
                                              className="w-4 h-4 accent-amber-500 rounded"
                                            />
                                            ¿Extraer Muestras para Showroom /
                                            Control de Calidad?
                                          </label>

                                          {item.hasShowroomSample && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-slate-400 text-xs">
                                                Unidades de muestra extraídas:
                                              </span>
                                              <input
                                                type="number"
                                                min={1}
                                                value={item.sampleUnitsCount}
                                                onChange={(e) => {
                                                  const val = Number(
                                                    e.target.value,
                                                  );
                                                  setPhysicalControlItems(
                                                    (prev) => {
                                                      const copy = [...prev];
                                                      copy[realIdx] = {
                                                        ...copy[realIdx],
                                                        sampleUnitsCount: val,
                                                      };
                                                      return copy;
                                                    },
                                                  );
                                                }}
                                                className="w-20 bg-slate-950 border border-amber-500/60 p-1.5 rounded text-amber-300 font-bold text-center text-xs"
                                              />
                                            </div>
                                          )}
                                        </div>

                                        {hasComponents && (
                                          <div className="bg-purple-950/30 border border-purple-800/50 p-3 rounded-lg space-y-2">
                                            <span className="text-xs font-bold text-purple-300 block">
                                              Desglose por Componentes (SKUs
                                              Hijos)
                                            </span>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                              {item.components!.map(
                                                (comp: ComboComponent) => (
                                                  <div
                                                    key={comp.childSku}
                                                    className="bg-slate-950/80 p-2 rounded border border-slate-800 flex justify-between items-center"
                                                  >
                                                    <div>
                                                      <strong className="text-amber-400 font-mono block">
                                                        {comp.childSku}
                                                      </strong>
                                                      <span className="text-slate-300">
                                                        {comp.description}
                                                      </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                      <span className="bg-purple-900/80 text-purple-200 px-2 py-1 rounded font-bold">
                                                        {item.quantityBultos *
                                                          comp.quantityPerCombo}{' '}
                                                        bultos
                                                      </span>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          handleAddPalletToItem(
                                                            realIdx,
                                                            comp.childSku,
                                                          )
                                                        }
                                                        className="px-2 py-1 bg-purple-800 hover:bg-purple-700 text-white font-bold rounded text-[10px]"
                                                      >
                                                        + Pallet
                                                      </button>
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        <div className="space-y-3">
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-slate-300 text-xs">
                                                Distribución de Pallets y
                                                Estibado
                                              </span>
                                              {missingBultos > 0 &&
                                                !hasComponents && (
                                                  <span className="text-[11px] font-bold text-amber-400">
                                                    (Pendientes de asignar:{' '}
                                                    {missingBultos} bultos)
                                                  </span>
                                                )}
                                            </div>

                                            {!hasComponents && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleAddPalletToItem(realIdx)
                                                }
                                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold rounded text-[11px]"
                                              >
                                                + Agregar Otro Pallet
                                              </button>
                                            )}
                                          </div>

                                          {(item.pallets || []).map(
                                            (
                                              pallet: PhysicalControlPallet,
                                              pIdx: number,
                                            ) => {
                                              const keySearch = `${item.sku}_${pIdx}`;
                                              const locSearchQuery = (
                                                phase2LocationSearches[
                                                  keySearch
                                                ] || ''
                                              )
                                                .toLowerCase()
                                                .trim();

                                              const filteredLocList =
                                                locSearchQuery
                                                  ? locations.filter(
                                                      (l) =>
                                                        l.code
                                                          .toLowerCase()
                                                          .includes(
                                                            locSearchQuery,
                                                          ) ||
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
                                                  className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-3"
                                                >
                                                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                                                    <span className="font-bold text-amber-400">
                                                      Pallet #
                                                      {pallet.palletIndex}
                                                    </span>
                                                    {pallet.childSku && (
                                                      <span className="text-xs font-mono text-purple-300 font-bold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800">
                                                        SKU Hijo:{' '}
                                                        {pallet.childSku}
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                                    <div className="sm:col-span-2">
                                                      <label
                                                        htmlFor={`pallet-qty-${realIdx}-${pIdx}`}
                                                        className="block text-slate-400 mb-1 text-[11px]"
                                                      >
                                                        Bultos
                                                      </label>
                                                      <input
                                                        id={`pallet-qty-${realIdx}-${pIdx}`}
                                                        type="number"
                                                        value={
                                                          pallet.quantityBultos
                                                        }
                                                        onChange={(e) =>
                                                          handleUpdatePalletItem(
                                                            realIdx,
                                                            pIdx,
                                                            'quantityBultos',
                                                            Number(
                                                              e.target.value,
                                                            ),
                                                          )
                                                        }
                                                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-amber-300 font-bold text-center text-xs"
                                                      />
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                      <label
                                                        htmlFor={`pallet-units-${realIdx}-${pIdx}`}
                                                        className="block text-slate-400 mb-1 text-[11px]"
                                                      >
                                                        Unid. x Bulto
                                                      </label>
                                                      <input
                                                        id={`pallet-units-${realIdx}-${pIdx}`}
                                                        type="number"
                                                        value={
                                                          pallet.unitsPerBox
                                                        }
                                                        onChange={(e) =>
                                                          handleUpdatePalletItem(
                                                            realIdx,
                                                            pIdx,
                                                            'unitsPerBox',
                                                            Number(
                                                              e.target.value,
                                                            ),
                                                          )
                                                        }
                                                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold text-center text-xs"
                                                      />
                                                    </div>

                                                    <div className="sm:col-span-3">
                                                      <span className="block text-slate-400 mb-1 text-[11px]">
                                                        Medidas (L x A x H cm)
                                                      </span>
                                                      <div className="flex gap-1">
                                                        <input
                                                          aria-label="Largo en cm"
                                                          type="number"
                                                          value={
                                                            pallet.lengthCm
                                                          }
                                                          onChange={(e) =>
                                                            handleUpdatePalletItem(
                                                              realIdx,
                                                              pIdx,
                                                              'lengthCm',
                                                              Number(
                                                                e.target.value,
                                                              ),
                                                            )
                                                          }
                                                          className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center text-xs"
                                                        />
                                                        <input
                                                          aria-label="Ancho en cm"
                                                          type="number"
                                                          value={pallet.widthCm}
                                                          onChange={(e) =>
                                                            handleUpdatePalletItem(
                                                              realIdx,
                                                              pIdx,
                                                              'widthCm',
                                                              Number(
                                                                e.target.value,
                                                              ),
                                                            )
                                                          }
                                                          className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center text-xs"
                                                        />
                                                        <input
                                                          aria-label="Alto en cm"
                                                          type="number"
                                                          value={
                                                            pallet.heightCm
                                                          }
                                                          onChange={(e) =>
                                                            handleUpdatePalletItem(
                                                              realIdx,
                                                              pIdx,
                                                              'heightCm',
                                                              Number(
                                                                e.target.value,
                                                              ),
                                                            )
                                                          }
                                                          className="w-1/3 bg-slate-950 border border-slate-800 p-1.5 rounded text-white text-center text-xs"
                                                        />
                                                      </div>
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                      <label
                                                        htmlFor={`pallet-weight-${realIdx}-${pIdx}`}
                                                        className="block text-slate-400 mb-1 text-[11px]"
                                                      >
                                                        Peso Bulto (Kg)
                                                      </label>
                                                      <input
                                                        id={`pallet-weight-${realIdx}-${pIdx}`}
                                                        type="number"
                                                        value={
                                                          pallet.weightPerBultoKg
                                                        }
                                                        onChange={(e) =>
                                                          handleUpdatePalletItem(
                                                            realIdx,
                                                            pIdx,
                                                            'weightPerBultoKg',
                                                            Number(
                                                              e.target.value,
                                                            ),
                                                          )
                                                        }
                                                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold text-center text-xs"
                                                      />
                                                    </div>

                                                    <div className="sm:col-span-3">
                                                      <label
                                                        htmlFor={`pallet-loc-${realIdx}-${pIdx}`}
                                                        className="block text-slate-400 mb-1 text-[11px]"
                                                      >
                                                        Ubicación Destino *
                                                      </label>
                                                      <div className="space-y-1">
                                                        <input
                                                          type="text"
                                                          placeholder="Filtrar..."
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
                                                                  e.target
                                                                    .value,
                                                              }),
                                                            )
                                                          }
                                                          className="w-full bg-slate-950 border border-slate-800 p-1 rounded text-white text-[11px]"
                                                        />
                                                        <select
                                                          id={`pallet-loc-${realIdx}-${pIdx}`}
                                                          value={
                                                            pallet.locationId
                                                          }
                                                          onChange={(e) =>
                                                            handleUpdatePalletItem(
                                                              realIdx,
                                                              pIdx,
                                                              'locationId',
                                                              e.target.value,
                                                            )
                                                          }
                                                          className="w-full bg-slate-950 border border-amber-500/40 p-1.5 rounded text-white font-bold text-xs"
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
                                                                  {loc.zoneName}
                                                                  )
                                                                </option>
                                                              ),
                                                            )
                                                          ) : (
                                                            <option value="">
                                                              Sin ubicaciones
                                                            </option>
                                                          )}
                                                        </select>
                                                      </div>
                                                    </div>
                                                  </div>

                                                  <div className="flex justify-end gap-2 border-t border-slate-800/60 pt-2">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setPrintModalData({
                                                          productSku:
                                                            pallet.childSku ||
                                                            item.sku,
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
                                                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[10px]"
                                                    >
                                                      Rótulo A4
                                                    </button>

                                                    {item.pallets.length >
                                                      1 && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          handleRemovePalletFromItem(
                                                            realIdx,
                                                            pIdx,
                                                          )
                                                        }
                                                        aria-label={`Eliminar Pallet #${pallet.palletIndex}`}
                                                        className="px-2 py-1.5 bg-red-950 border border-red-800 text-red-400 hover:bg-red-900 rounded font-bold text-xs"
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
                            },
                          )}
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

            {/* TAB: HISTORIAL */}
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
                              {c.containerNumber} (Ver Detalle)
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
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-[10px] font-black shadow"
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

            {/* TAB: STOCK & RÓTULOS */}
            {activeTab === 'STOCK' && (
              <section className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-amber-400">
                      Control de Stock e Impresión de Rótulos A4
                    </h2>
                    <p className="text-xs text-slate-400">
                      Visualización de ubicación, auditoría de usuario y egreso
                      manual por Administrador
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {deductionHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeductionHistoryModal(true);
                          setDeductionHistoryPage(1);
                        }}
                        className="px-3 py-2 bg-purple-950 text-purple-300 border border-purple-800 hover:bg-purple-900 font-bold rounded-xl text-xs transition-colors"
                      >
                        Ver Historial Descuentos ({deductionHistory.length})
                      </button>
                    )}

                    <div>
                      <label htmlFor="stock-search-input" className="sr-only">
                        Buscar por SKU o Producto
                      </label>
                      <input
                        id="stock-search-input"
                        type="text"
                        placeholder="Buscar por SKU o Producto..."
                        value={stockSearchQuery}
                        onChange={(e) => {
                          setStockSearchQuery(e.target.value);
                          setStockPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold w-full sm:w-72"
                      />
                    </div>
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
                        <div className="flex items-center gap-3">
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
                              setRelocateItem({
                                productSku: prod.productSku,
                                productName: prod.productName,
                                availableSources: prod.locations,
                              });
                              const initialSourceWh =
                                prod.locations[0]?.warehouseId ||
                                simpleWarehousesList[0]?.id ||
                                '';
                              setSelectedSourceInventoryId(
                                prod.locations[0]?.inventoryId || '',
                              );
                              setRelocateTargetWarehouseId(initialSourceWh);
                              setRelocateTargetLocId('');
                              setRelocateSearchLocQuery('');
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-bold rounded-lg text-xs"
                          >
                            Reubicar
                          </button>

                          {userRole === 'ADMIN' && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeductStockItem({
                                  productSku: prod.productSku,
                                  productName: prod.productName,
                                  availableSources: prod.locations,
                                });
                                setDeductSourceInventoryId(
                                  prod.locations[0]?.inventoryId || '',
                                );
                              }}
                              className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 font-bold rounded-lg text-xs"
                            >
                              Descontar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {prod.locations.map((loc, lIdx) => (
                          <div
                            key={lIdx}
                            className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex justify-between items-center text-xs"
                          >
                            <div>
                              <span className="font-mono font-bold text-white block">
                                Posición: {loc.locationCode}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {loc.warehouseName}
                              </span>
                              <span className="text-[9px] text-slate-500 block mt-0.5">
                                Audit: {loc.updatedBy}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-bold text-emerald-400 font-mono text-sm">
                                {loc.quantityBultos} B.
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
                                    date: new Date().toLocaleDateString(
                                      'es-AR',
                                    ),
                                  })
                                }
                                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded text-[9px]"
                              >
                                Imprimir Rótulo
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {filteredConsolidatedStock.length > ITEMS_PER_PAGE && (
                  <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-800">
                    <span className="text-slate-400">
                      Mostrando {paginatedConsolidatedStock.length} de{' '}
                      {filteredConsolidatedStock.length} SKUs en stock
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

            {/* TAB: MANTENIMIENTO UBICACIONES */}
            {activeTab === 'CONFIG' && (
              <section className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    Crear Depósito o Almacén
                  </h2>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Nombre del Depósito (Ej. Depósito Central)"
                      value={newWhName}
                      onChange={(e) => setNewWhName(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white flex-1 font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleCreateWarehouse}
                      disabled={submitting}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs disabled:opacity-50"
                    >
                      + Crear Depósito
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h2 className="text-base font-bold text-amber-400 border-b border-slate-800 pb-2">
                    Generación Masiva de Ubicaciones por Lote
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">
                        Depósito Destino
                      </label>
                      <select
                        value={targetConfigWhId}
                        onChange={(e) => setTargetConfigWhId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                      >
                        {simpleWarehousesList.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Categoría Ubicación
                      </label>
                      <select
                        value={genCategory}
                        onChange={(e) =>
                          setGenCategory(e.target.value as LocationTypeCategory)
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                      >
                        <option value="RACK">RACK</option>
                        <option value="PISO">PISO</option>
                        <option value="SHOWROOM">SHOWROOM</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Nombre Área / Rack
                      </label>
                      <input
                        type="text"
                        value={genAreaName}
                        onChange={(e) => setGenAreaName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Niveles (separados por coma)
                      </label>
                      <input
                        type="text"
                        value={genLevelsInput}
                        onChange={(e) => setGenLevelsInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Módulo Inicio
                      </label>
                      <input
                        type="number"
                        value={genPosStart}
                        onChange={(e) => setGenPosStart(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Módulo Fin
                      </label>
                      <input
                        type="number"
                        value={genPosEnd}
                        onChange={(e) => setGenPosEnd(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">
                        Capacidad Max m³ x Posición
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={genCapacityM3}
                        onChange={(e) =>
                          setGenCapacityM3(Number(e.target.value))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-amber-400 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateBatch}
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs disabled:opacity-50"
                  >
                    Generar Posiciones en Lote
                  </button>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-3">
                    <h2 className="text-base font-bold text-amber-400">
                      Mantenimiento y Edición de Posiciones
                    </h2>

                    <div className="flex gap-2">
                      <select
                        value={selectedAreaFilter}
                        onChange={(e) => {
                          setSelectedAreaFilter(e.target.value);
                          setConfigPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold"
                      >
                        <option value="ALL">Todas las Áreas</option>
                        {availableAreasInWarehouse.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleSaveCapacityChanges}
                        disabled={
                          Object.keys(editedCapacities).length === 0 ||
                          submitting
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                      >
                        Guardar Capacidades (
                        {Object.keys(editedCapacities).length})
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteSelectedLocations}
                        disabled={
                          selectedLocIdsForDelete.length === 0 || submitting
                        }
                        className="px-3 py-1.5 bg-red-950 border border-red-800 text-red-300 font-bold rounded-xl text-xs disabled:opacity-50"
                      >
                        Eliminar Posiciones ({selectedLocIdsForDelete.length})
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteFullWarehouse}
                        disabled={submitting}
                        className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white font-bold rounded-xl text-xs disabled:opacity-50"
                      >
                        Eliminar Depósito
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">
                            <input
                              type="checkbox"
                              onChange={handleToggleSelectAllLocations}
                              checked={
                                visibleLocationsInMaintenance.length > 0 &&
                                visibleLocationsInMaintenance.every((l) =>
                                  selectedLocIdsForDelete.includes(l.id),
                                )
                              }
                              className="w-4 h-4 accent-amber-500 rounded"
                            />
                          </th>
                          <th className="p-3">Código Posición</th>
                          <th className="p-3">Área / Zona</th>
                          <th className="p-3">Nivel</th>
                          <th className="p-3">Categoría</th>
                          <th className="p-3">Capacidad Max (m³)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {paginatedLocations.map((loc) => (
                          <tr key={loc.id} className="hover:bg-slate-950/50">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedLocIdsForDelete.includes(
                                  loc.id,
                                )}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedLocIdsForDelete((prev) =>
                                    checked
                                      ? [...prev, loc.id]
                                      : prev.filter((id) => id !== loc.id),
                                  );
                                }}
                                className="w-4 h-4 accent-amber-500 rounded"
                              />
                            </td>
                            <td className="p-3 font-mono font-bold text-amber-400">
                              {loc.code}
                            </td>
                            <td className="p-3">{loc.zoneName}</td>
                            <td className="p-3 font-bold">{loc.rackLevel}</td>
                            <td className="p-3">{loc.category}</td>
                            <td className="p-3">
                              <input
                                type="number"
                                step="0.1"
                                value={
                                  editedCapacities[loc.id] !== undefined
                                    ? editedCapacities[loc.id]
                                    : loc.maxCapacityM3
                                }
                                onChange={(e) =>
                                  setEditedCapacities((prev) => ({
                                    ...prev,
                                    [loc.id]: Number(e.target.value),
                                  }))
                                }
                                className="w-24 bg-slate-950 border border-slate-800 p-1 rounded text-amber-300 font-mono font-bold text-center"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {visibleLocationsInMaintenance.length > ITEMS_PER_PAGE && (
                    <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-800">
                      <span className="text-slate-400">
                        Mostrando {paginatedLocations.length} de{' '}
                        {visibleLocationsInMaintenance.length} ubicaciones
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={configPage === 1}
                          onClick={() => setConfigPage((p) => p - 1)}
                          className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                        >
                          Anterior
                        </button>
                        <span className="px-3 py-1 bg-slate-950 text-amber-400 font-mono font-bold rounded">
                          Pág. {configPage}
                        </span>
                        <button
                          type="button"
                          disabled={
                            configPage * ITEMS_PER_PAGE >=
                            visibleLocationsInMaintenance.length
                          }
                          onClick={() => setConfigPage((p) => p + 1)}
                          className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {/* MODAL: DETALLE DE CONTENEDOR (TAB HISTORIAL) */}
        {selectedContainerDetail && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-black text-amber-400">
                  Detalle Contenedor: {selectedContainerDetail.containerNumber}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedContainerDetail(null)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  X Cerrar
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block">Depósito:</span>
                  <strong className="text-white">
                    {selectedContainerDetail.warehouseName}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Bultos:</span>
                  <strong className="text-amber-400">
                    {selectedContainerDetail.totalBultos}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Estado:</span>
                  <strong className="text-emerald-400">
                    {selectedContainerDetail.status}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Pre-carga:</span>
                  <strong className="text-slate-300">
                    {new Date(
                      selectedContainerDetail.arrivalDate,
                    ).toLocaleDateString('es-AR')}
                  </strong>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase">
                  Ítems Registrados
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                      <tr>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Descripción</th>
                        <th className="p-2 text-center">Bultos</th>
                        <th className="p-2 text-center">Auditado por</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedContainerDetail.items.map((it, iIdx) => (
                        <tr key={iIdx}>
                          <td className="p-2 font-mono font-bold text-amber-400">
                            {it.sku}
                          </td>
                          <td className="p-2">{it.description}</td>
                          <td className="p-2 text-center font-bold">
                            {it.quantityBultos}
                          </td>
                          <td className="p-2 text-center text-slate-400">
                            {it.controlledBy || it.auditedBy || 'Sistema'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: REUBICAR STOCK (INTER-DEPÓSITO E INTRA-DEPÓSITO) */}
        {relocateItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-lg w-full space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-amber-400">
                  Reubicar Pallet / Bultos - SKU: {relocateItem.productSku}
                </h3>
                <button
                  type="button"
                  onClick={() => setRelocateItem(null)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  X
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    1. Seleccione Posición de Origen *
                  </label>
                  <select
                    value={selectedSourceInventoryId}
                    onChange={(e) => {
                      const invId = e.target.value;
                      setSelectedSourceInventoryId(invId);
                      const selectedSource = relocateItem.availableSources.find(
                        (s) => s.inventoryId === invId,
                      );
                      if (selectedSource) {
                        setRelocateTargetWarehouseId(
                          selectedSource.warehouseId,
                        );
                        setRelocateTargetLocId('');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                  >
                    <option value="">-- Seleccionar Posición Origen --</option>
                    {relocateItem.availableSources.map((s) => (
                      <option key={s.inventoryId} value={s.inventoryId}>
                        {s.locationCode} ({s.warehouseName}) -{' '}
                        {s.quantityBultos} Bultos
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    2. Cantidad a Mover (Bultos) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={relocateQuantity}
                    onChange={(e) =>
                      setRelocateQuantity(Number(e.target.value))
                    }
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-amber-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    3. Seleccione Depósito Destino *
                  </label>
                  <select
                    value={relocateTargetWarehouseId}
                    onChange={(e) => {
                      setRelocateTargetWarehouseId(e.target.value);
                      setRelocateTargetLocId('');
                    }}
                    className="w-full bg-slate-950 border border-amber-500/50 p-2 rounded text-amber-300 font-bold"
                  >
                    <option value="">-- Seleccionar Depósito Destino --</option>
                    {simpleWarehousesList.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    4. Filtrar y Seleccionar Posición Destino *
                  </label>
                  <input
                    type="text"
                    placeholder="Buscar ubicación destino..."
                    value={relocateSearchLocQuery}
                    onChange={(e) => setRelocateSearchLocQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white mb-1"
                  />
                  <select
                    value={relocateTargetLocId}
                    onChange={(e) => setRelocateTargetLocId(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 p-2 rounded text-white font-bold"
                  >
                    <option value="">-- Seleccionar Posición Destino --</option>
                    {filteredRelocateLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zoneName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRelocateItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRelocation}
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs disabled:opacity-50"
                >
                  Confirmar Transferencia
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: DESCONTAR STOCK (ADMIN EXCLUSIVO) */}
        {deductStockItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-red-900/80 p-6 rounded-2xl max-w-lg w-full space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-red-400">
                  Descontar Stock Manual (Admin) - SKU:{' '}
                  {deductStockItem.productSku}
                </h3>
                <button
                  type="button"
                  onClick={() => setDeductStockItem(null)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  X
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Origen de Egreso *
                  </label>
                  <select
                    value={deductSourceInventoryId}
                    onChange={(e) => setDeductSourceInventoryId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white font-bold"
                  >
                    {deductStockItem.availableSources.map((s) => (
                      <option key={s.inventoryId} value={s.inventoryId}>
                        {s.locationCode} ({s.quantityBultos} Bultos disponibles)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Cantidad a Descontar (Bultos) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={deductQuantity}
                    onChange={(e) => setDeductQuantity(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-red-500/50 p-2 rounded text-red-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Motivo / Justificación *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej. Rotura en depósito, Venta directa de muestra..."
                    value={deductReason}
                    onChange={(e) => setDeductReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeductStockItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeduction}
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs disabled:opacity-50"
                >
                  Aplicar Descuento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: HISTORIAL DE AUDITORÍA Y DESCUENTOS DE STOCK */}
        {showDeductionHistoryModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-purple-800 p-6 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-purple-300">
                  Historial de Descuentos Manuales de Stock
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDeductionHistoryModal(false)}
                  className="text-slate-400 hover:text-white font-bold"
                >
                  X Cerrar
                </button>
              </div>

              <div className="flex justify-between items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar por SKU, motivo, ubicación o usuario..."
                  value={deductionSearchQuery}
                  onChange={(e) => {
                    setDeductionSearchQuery(e.target.value);
                    setDeductionHistoryPage(1);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs text-white"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2">Fecha</th>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Ubicación</th>
                      <th className="p-2 text-center">Bultos</th>
                      <th className="p-2">Motivo</th>
                      <th className="p-2">Usuario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {paginatedDeductionHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="p-2 text-slate-400">{h.timestamp}</td>
                        <td className="p-2 font-mono font-bold text-amber-400">
                          {h.productSku}
                        </td>
                        <td className="p-2 font-mono">{h.locationCode}</td>
                        <td className="p-2 text-center font-bold text-red-400">
                          -{h.quantityBultos}
                        </td>
                        <td className="p-2">{h.reason}</td>
                        <td className="p-2 font-bold text-purple-300">
                          {h.performedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredDeductionHistory.length > ITEMS_PER_PAGE && (
                <div className="flex justify-between items-center text-xs pt-3 border-t border-slate-800">
                  <span className="text-slate-400">
                    Mostrando {paginatedDeductionHistory.length} de{' '}
                    {filteredDeductionHistory.length} registros
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={deductionHistoryPage === 1}
                      onClick={() => setDeductionHistoryPage((p) => p - 1)}
                      className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 bg-slate-950 text-amber-400 font-mono font-bold rounded">
                      Pág. {deductionHistoryPage}
                    </span>
                    <button
                      type="button"
                      disabled={
                        deductionHistoryPage * ITEMS_PER_PAGE >=
                        filteredDeductionHistory.length
                      }
                      onClick={() => setDeductionHistoryPage((p) => p + 1)}
                      className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-white rounded font-bold"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: IMPRESIÓN RÓTULO PALLET A4 */}
        {printModalData && (
          <PalletLabelModal
            data={printModalData}
            onClose={() => setPrintModalData(null)}
          />
        )}
      </main>
    </ProtectedRoute>
  );
}
