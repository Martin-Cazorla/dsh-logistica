// frontend/src/components/inventory/ManualStockModal.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { inventoryService } from '@/services/inventory.service';
import {
  PhysicalLocation,
  ManualStockItem,
  LocationStockDetail,
} from '@/types/inventory.types';

interface ManualStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouses: Array<{ id: string; name: string }>;
}

export const ManualStockModal: React.FC<ManualStockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  warehouses,
}) => {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  const [currentLocationStock, setCurrentLocationStock] = useState<
    LocationStockDetail[]
  >([]);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filas del formulario dinámico de carga
  const [items, setItems] = useState<ManualStockItem[]>([
    {
      productSku: '',
      productName: '',
      quantityBultos: 1,
      unitsPerBox: 1,
      weightPerBultoKg: 10,
      volumePerBultoM3: 0.036,
      notes: '',
    },
  ]);

  // Cargar ubicaciones cuando cambia el depósito seleccionado
  useEffect(() => {
    if (!selectedWarehouseId) {
      setLocations([]);
      setSelectedLocationId('');
      return;
    }

    const fetchLocations = async () => {
      try {
        const locs =
          await inventoryService.getAvailableLocations(selectedWarehouseId);
        setLocations(locs);
        setSelectedLocationId('');
      } catch (err) {
        console.error('Error al cargar ubicaciones:', err);
      }
    };

    fetchLocations();
  }, [selectedWarehouseId]);

  // Cargar el stock actual de la posición al seleccionar una ubicación
  useEffect(() => {
    if (!selectedLocationId) {
      setCurrentLocationStock([]);
      return;
    }

    const fetchLocationStock = async () => {
      setLoadingStock(true);
      try {
        const stockData =
          await inventoryService.getStockByLocation(selectedLocationId);
        setCurrentLocationStock(stockData);
      } catch (err) {
        console.error('Error al obtener el stock de la ubicación:', err);
      } finally {
        setLoadingStock(false);
      }
    };

    fetchLocationStock();
  }, [selectedLocationId]);

  // Manejadores para agregar, quitar y modificar filas
  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        productSku: '',
        productName: '',
        quantityBultos: 1,
        unitsPerBox: 1,
        weightPerBultoKg: 10,
        volumePerBultoM3: 0.036,
        notes: '',
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof ManualStockItem,
    value: any,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Enviar el formulario al backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedWarehouseId || !selectedLocationId) {
      setErrorMessage('Debes seleccionar un depósito y una ubicación válida.');
      return;
    }

    const invalidItems = items.some(
      (item) =>
        !item.productSku.trim() ||
        !item.productName.trim() ||
        item.quantityBultos <= 0,
    );

    if (invalidItems) {
      setErrorMessage(
        'Todos los productos deben incluir SKU, nombre y una cantidad mayor a 0.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await inventoryService.createManualStock({
        warehouseId: selectedWarehouseId,
        locationId: selectedLocationId,
        items,
      });

      // Resetear estado del formulario
      setItems([
        {
          productSku: '',
          productName: '',
          quantityBultos: 1,
          unitsPerBox: 1,
          weightPerBultoKg: 10,
          volumePerBultoM3: 0.036,
          notes: '',
        },
      ]);
      setSelectedLocationId('');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al realizar la carga manual:', err);
      setErrorMessage(
        err.response?.data?.message || 'Error al registrar el stock manual.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📦 Carga Manual / Toma de Stock por Ubicación
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg bg-red-950/80 border border-red-800 p-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          {/* Selección de Depósito y Ubicación */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Depósito
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">-- Seleccionar Depósito --</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Ubicación / Posición
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={!selectedWarehouseId || locations.length === 0}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                required
              >
                <option value="">-- Seleccionar Ubicación --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} ({loc.category} - {loc.zoneName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumen del Stock Actual en la Ubicación Elección */}
          {selectedLocationId && (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">
                Stock actual en esta posición:
              </h3>
              {loadingStock ? (
                <p className="text-xs text-slate-500">Cargando stock...</p>
              ) : currentLocationStock.length > 0 ? (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {currentLocationStock.map((stock) => (
                    <div
                      key={stock.id}
                      className="flex justify-between items-center text-xs text-slate-300 bg-slate-900 px-3 py-1.5 rounded"
                    >
                      <span>
                        <strong className="text-blue-400">
                          {stock.productSku}
                        </strong>{' '}
                        - {stock.productName}
                      </span>
                      <span className="font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded">
                        {stock.quantityBultos} bulto(s)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  La posición está actualmente vacía.
                </p>
              )}
            </div>
          )}

          {/* Formulario Dinámico de Productos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Productos a ingresar / modificar
              </h3>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                + Agregar producto
              </button>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 items-center"
              >
                <div className="md:col-span-3">
                  <input
                    type="text"
                    placeholder="SKU"
                    value={item.productSku}
                    onChange={(e) =>
                      handleItemChange(index, 'productSku', e.target.value)
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="md:col-span-4">
                  <input
                    type="text"
                    placeholder="Descripción / Nombre"
                    value={item.productName}
                    onChange={(e) =>
                      handleItemChange(index, 'productName', e.target.value)
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Bultos"
                    value={item.quantityBultos}
                    onChange={(e) =>
                      handleItemChange(
                        index,
                        'quantityBultos',
                        parseInt(e.target.value, 10) || 0,
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Unid/Caja"
                    value={item.unitsPerBox || 1}
                    onChange={(e) =>
                      handleItemChange(
                        index,
                        'unitsPerBox',
                        parseInt(e.target.value, 10) || 1,
                      )
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemoveItemRow(index)}
                    disabled={items.length === 1}
                    className="text-red-400 hover:text-red-300 disabled:opacity-30 text-sm p-1"
                    title="Eliminar fila"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Botones de Acción */}
          <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar e Ingresar Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
