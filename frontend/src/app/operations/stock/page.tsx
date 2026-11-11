// frontend/src/app/operations/stock/page.tsx

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { inventoryService } from '@/services/inventory.service';
import { stockRequestsService } from '@/services/stock-requests.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDateTime } from '@/lib/format';
import { InventoryStock, PhysicalLocation } from '@/types/inventory.types';
import { StockRequest, StockRequestType } from '@/types/stock-requests.types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  Modal,
  PageHeader,
  Tabs,
} from '@/components/ui';

type TabKey = 'STOCK' | 'MINE';

/**
 * Pantalla del PICKER para inventario:
 *  - Reubicación física de pallets (aplica inmediatamente: no cambia cantidades).
 *  - Conteo / solicitud de descuento: queda PENDIENTE hasta que un Gestor o
 *    Administrador la apruebe. El stock no se modifica sin esa aprobación.
 */
export default function OperatorStockPage() {
  return (
    <AppShell permissions={['INVENTORY_COUNT', 'INVENTORY_RELOCATE']}>
      <OperatorStockScreen />
    </AppShell>
  );
}

function OperatorStockScreen() {
  const [tab, setTab] = useState<TabKey>('STOCK');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<InventoryStock[]>([]);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [relocate, setRelocate] = useState<InventoryStock | null>(null);
  const [count, setCount] = useState<InventoryStock | null>(null);

  useEffect(() => {
    inventoryService
      .getWarehousesList()
      .then((list) => {
        setWarehouses(list);
        if (list[0]) setWarehouseId(list[0].id);
      })
      .catch((err) => setError(getApiErrorMessage(err, 'No se pudieron cargar los depósitos.')));
  }, []);

  const loadStock = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setError(null);
    try {
      setStock(await inventoryService.getStockList(warehouseId, search.trim() || undefined));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el stock.'));
    } finally {
      setLoading(false);
    }
  }, [warehouseId, search]);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await stockRequestsService.list());
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar sus solicitudes.'));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadStock, 300);
    return () => clearTimeout(t);
  }, [loadStock]);

  useEffect(() => {
    if (tab === 'MINE') loadRequests();
  }, [tab, loadRequests]);

  return (
    <div>
      <PageHeader
        title="Stock: reubicar y contar"
        subtitle="Las reubicaciones se aplican al instante. Conteos y descuentos requieren aprobación de un Gestor."
      />
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'STOCK', label: 'Stock por ubicación' },
          { key: 'MINE', label: 'Mis solicitudes' },
        ]}
      />

      {tab === 'STOCK' ? (
        <>
          <Card className="mb-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Buscar SKU, descripción o código de ubicación"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Card>

          {loading ? (
            <LoadingBlock />
          ) : stock.length === 0 ? (
            <EmptyState title="Sin stock para la búsqueda" />
          ) : (
            <ul className="space-y-2">
              {stock.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-white">{s.locationCode}</p>
                    <p className="truncate text-sm text-slate-300">
                      <span className="font-mono text-amber-300">{s.productSku}</span> {s.productName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {s.quantityBultos} bultos{s.containerNumber ? ` · Lote ${s.containerNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setRelocate(s)}>
                      Reubicar
                    </Button>
                    <Button size="sm" onClick={() => setCount(s)}>
                      Contar / ajustar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : requests.length === 0 ? (
        <EmptyState title="No registró solicitudes" />
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-mono font-bold text-amber-300">{r.productSku}</span> en {r.locationCode}
                </span>
                <Badge tone={r.status === 'PENDING' ? 'amber' : r.status === 'APPROVED' ? 'emerald' : 'red'}>
                  {r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}
                </Badge>
              </div>
              <p className="text-slate-300">
                {r.systemQty} → {r.countedQty} ({r.quantityDelta > 0 ? '+' : ''}{r.quantityDelta}) · {r.reason}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatDateTime(r.createdAt)}
                {r.reviewedBy && ` · ${r.reviewedBy}: ${r.reviewNotes ?? ''}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {relocate && (
        <RelocateModal
          item={relocate}
          warehouses={warehouses}
          onClose={() => setRelocate(null)}
          onDone={async (msg) => {
            setRelocate(null);
            setSuccess(msg);
            await loadStock();
          }}
        />
      )}

      {count && (
        <CountModal
          item={count}
          onClose={() => setCount(null)}
          onDone={async (msg) => {
            setCount(null);
            setSuccess(msg);
            await loadStock();
          }}
        />
      )}
    </div>
  );
}

function RelocateModal({
  item,
  warehouses,
  onClose,
  onDone,
}: {
  item: InventoryStock;
  warehouses: { id: string; name: string }[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [targetWarehouseId, setTargetWarehouseId] = useState(item.warehouseId);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [locSearch, setLocSearch] = useState('');
  const [targetId, setTargetId] = useState('');
  const [qty, setQty] = useState(item.quantityBultos);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inventoryService
      .getAvailableLocations(targetWarehouseId)
      .then(setLocations)
      .catch(() => setLocations([]));
    setTargetId('');
  }, [targetWarehouseId]);

  const filtered = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    return locations
      .filter((l) => l.id !== item.locationId)
      .filter((l) => !q || l.code.toLowerCase().includes(q))
      .slice(0, 40);
  }, [locations, locSearch, item.locationId]);

  const submit = async () => {
    if (!targetId) {
      setError('Seleccione la ubicación de destino.');
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > item.quantityBultos) {
      setError(`La cantidad debe estar entre 1 y ${item.quantityBultos}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await inventoryService.transferStock({
        inventoryId: item.id,
        targetLocationId: targetId,
        quantityBultos: qty,
      });
      const target = locations.find((l) => l.id === targetId);
      onDone(`${qty} bultos de ${item.productSku} movidos a ${target?.code ?? 'destino'}.`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo reubicar.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Reubicar ${item.productSku} desde ${item.locationCode}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>Confirmar movimiento</Button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="space-y-3">
        <Field label={`Bultos a mover (máx. ${item.quantityBultos})`}>
          <input
            type="number"
            min={1}
            max={item.quantityBultos}
            className={inputClass}
            value={qty}
            onChange={(e) => setQty(Math.floor(Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="Depósito destino">
          <select className={inputClass} value={targetWarehouseId} onChange={(e) => setTargetWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Ubicación destino">
          <input className={inputClass} placeholder="Buscar código…" value={locSearch} onChange={(e) => setLocSearch(e.target.value)} />
        </Field>
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-700">
          {filtered.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => setTargetId(l.id)}
                className={`w-full px-3 py-2 text-left text-sm ${targetId === l.id ? 'bg-amber-500 font-bold text-slate-950' : 'hover:bg-slate-800'}`}
              >
                {l.code}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Sin ubicaciones.</li>}
        </ul>
      </div>
    </Modal>
  );
}

function CountModal({
  item,
  onClose,
  onDone,
}: {
  item: InventoryStock;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [type, setType] = useState<StockRequestType>('COUNT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || (type === 'ADJUSTMENT' && n < 1)) {
      setError('Ingrese una cantidad válida.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Indique el motivo (mínimo 3 caracteres).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await stockRequestsService.create({
        inventoryId: item.id,
        type,
        ...(type === 'COUNT' ? { countedQty: n } : { quantity: n }),
        reason: reason.trim(),
      });
      onDone(
        created.status === 'APPROVED'
          ? 'Conteo registrado: coincide con el sistema.'
          : `Solicitud enviada (${created.quantityDelta > 0 ? '+' : ''}${created.quantityDelta}). Queda pendiente de aprobación.`,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo registrar la solicitud.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${item.productSku} en ${item.locationCode}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>Enviar</Button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <Alert kind="info">El stock no cambia hasta que un Gestor o Administrador apruebe la solicitud.</Alert>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={type === 'COUNT' ? 'primary' : 'secondary'} onClick={() => setType('COUNT')}>
            Conteo físico
          </Button>
          <Button variant={type === 'ADJUSTMENT' ? 'primary' : 'secondary'} onClick={() => setType('ADJUSTMENT')}>
            Solicitar descuento
          </Button>
        </div>
        <Field label={type === 'COUNT' ? 'Bultos contados en la ubicación' : 'Bultos a descontar'}>
          <input
            type="number"
            min={type === 'COUNT' ? 0 : 1}
            inputMode="numeric"
            className={`${inputClass} text-center text-2xl font-black`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Field label="Motivo">
          <input
            className={inputClass}
            placeholder={type === 'COUNT' ? 'Conteo cíclico, diferencia detectada…' : 'Rotura, faltante, muestra…'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
