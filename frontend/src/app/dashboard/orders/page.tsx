// frontend/src/app/dashboard/orders/page.tsx

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { ordersService } from '@/services/orders.service';
import { customersService } from '@/services/customers.service';
import { inventoryService } from '@/services/inventory.service';
import { usersService } from '@/services/users.service';
import { pickingService } from '@/services/picking.service';
import { getApiErrorMessage } from '@/lib/axios';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { Customer } from '@/types/customers.types';
import { CatalogProduct, OrderListItem, OrdersPage as OrdersPageData } from '@/types/orders.types';
import { ORDER_STATUS_LABELS, OrderStatus } from '@/types/picking.types';
import { ManagedUser } from '@/types/users.types';
import {
  Alert,
  Badge,
  BadgeTone,
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  Modal,
  PageHeader,
} from '@/components/ui';

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  PENDING: 'amber',
  IN_PICKING: 'sky',
  PICKED: 'purple',
  CHECKED: 'emerald',
  DISPATCHED: 'sky',
  DELIVERED: 'emerald',
  RETURNED: 'red',
  CANCELLED: 'slate',
};

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

interface DraftLine {
  product: CatalogProduct;
  bultos: number;
  unitPrice?: number;
}

export default function OrdersPage() {
  return (
    <ProtectedRoute requiredPermissions={['ORDERS_MANAGE']}>
      <OrdersScreen />
    </ProtectedRoute>
  );
}

function OrdersScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<OrdersPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [salesEnabled, setSalesEnabled] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<OrderListItem | null>(null);
  const [assignTarget, setAssignTarget] = useState<OrderListItem | null>(null);

  const showMoney = salesEnabled && can(user?.role, 'SALES_VIEW');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await ordersService.list({
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          page,
        }),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar los pedidos.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce de búsqueda
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    ordersService
      .getConfig()
      .then((c) => setSalesEnabled(c.salesModuleEnabled))
      .catch(() => setSalesEnabled(false));
  }, []);

  const cancelOrder = async (order: OrderListItem) => {
    const reason = prompt(`Motivo de cancelación del pedido ${order.orderNumber}:`);
    if (!reason?.trim()) return;
    try {
      await ordersService.cancel(order.id, reason.trim());
      setSuccess(`Pedido ${order.orderNumber} cancelado.`);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cancelar el pedido.'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Alta de pedidos, asignación de pickers y seguimiento hasta la entrega."
        actions={<Button onClick={() => setCreateOpen(true)}>+ Nuevo pedido</Button>}
      />

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {!salesEnabled && (
        <Alert kind="info">
          Módulo de Ventas deshabilitado: los pedidos se registran sin precios. Los campos monetarios
          ya existen en el modelo y se activarán con <code>SALES_MODULE_ENABLED=true</code>.
        </Alert>
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className={inputClass}
            placeholder="Buscar por N° de pedido, cliente o CUIT"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as OrderStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2 text-xs text-slate-400">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </Button>
            Página {data?.meta.page ?? 1} de {Math.max(data?.meta.totalPages ?? 1, 1)}
            <Button
              size="sm"
              variant="secondary"
              disabled={!data || page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </Button>
          </div>
        </div>
      </Card>

      {loading && !data ? (
        <LoadingBlock />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No hay pedidos" description="Cree el primero con “Nuevo pedido”." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente / Entrega</th>
                <th className="px-4 py-3">Carga</th>
                <th className="px-4 py-3">Pickers</th>
                <th className="px-4 py-3">Estado</th>
                {showMoney && <th className="px-4 py-3 text-right">Total</th>}
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {data.items.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3">
                    <button className="font-mono font-bold text-amber-300 hover:underline" onClick={() => setDetail(o)}>
                      {o.orderNumber}
                    </button>
                    <p className="text-xs text-slate-500">{formatDateTime(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{o.customer.name}</p>
                    <p className="text-xs text-slate-400">
                      {o.deliveryAddress.alias ? `${o.deliveryAddress.alias} · ` : ''}
                      {o.deliveryAddress.address}, {o.deliveryAddress.city}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {o.totalBultos} bultos · {formatNumber(Number(o.totalWeightKg), 1)} kg ·{' '}
                    {formatNumber(Number(o.totalVolumeM3), 2)} m³
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {o.pickerAssignments.length === 0
                      ? <span className="text-slate-500">Sin asignar</span>
                      : o.pickerAssignments.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                    {o.route && <p className="mt-1 text-[11px] text-sky-300">Hoja {o.route.code}</p>}
                  </td>
                  {showMoney && (
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-white">
                      $ {formatNumber(Number(o.totalAmount ?? 0), 2)}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(o.status === 'PENDING' || o.status === 'IN_PICKING') && (
                        <Button size="sm" variant="secondary" onClick={() => setAssignTarget(o)}>
                          Pickers
                        </Button>
                      )}
                      {(o.status === 'PENDING' || o.status === 'IN_PICKING') && (
                        <Button size="sm" variant="danger" onClick={() => cancelOrder(o)}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateOrderModal
          salesEnabled={showMoney}
          onClose={() => setCreateOpen(false)}
          onCreated={async (order) => {
            setCreateOpen(false);
            setSuccess(`Pedido ${order.orderNumber} creado. Asigne pickers para iniciar el armado.`);
            await load();
            setAssignTarget(order);
          }}
        />
      )}

      {assignTarget && (
        <AssignPickersModal
          order={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={async () => {
            setSuccess(`Pickers asignados al pedido ${assignTarget.orderNumber}.`);
            setAssignTarget(null);
            await load();
          }}
        />
      )}

      <Modal open={!!detail} title={`Pedido ${detail?.orderNumber ?? ''}`} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <p><span className="text-slate-500">Cliente:</span> <strong>{detail.customer.name}</strong></p>
              <p><span className="text-slate-500">Depósito:</span> {detail.sourceWarehouse.name}</p>
              <p>
                <span className="text-slate-500">Entrega:</span> {formatDate(detail.deliveryDateFrom)} –{' '}
                {formatDate(detail.deliveryDateTo)}
              </p>
            </div>
            {detail.notes && <p className="text-slate-400">{detail.notes}</p>}
            <table className="min-w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1">SKU</th>
                  <th>Producto</th>
                  <th className="text-right">Pedido</th>
                  <th className="text-right">Pickeado</th>
                  <th className="text-right">Controlado</th>
                  {showMoney && <th className="text-right">Subtotal</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1.5 font-mono text-amber-300">{i.product.sku}</td>
                    <td>{i.product.name}</td>
                    <td className="text-right">{i.bultos}</td>
                    <td className="text-right">{i.pickedQty}</td>
                    <td className="text-right">{i.checkedQty}</td>
                    {showMoney && <td className="text-right">$ {formatNumber(Number(i.lineTotal ?? 0), 2)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

// =============================================================================
// ALTA DE PEDIDO
// =============================================================================

function CreateOrderModal({
  salesEnabled,
  onClose,
  onCreated,
}: {
  salesEnabled: boolean;
  onClose: () => void;
  onCreated: (order: OrderListItem) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addressId, setAddressId] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [deliveryFrom, setDeliveryFrom] = useState('');
  const [deliveryTo, setDeliveryTo] = useState('');
  const [notes, setNotes] = useState('');
  const [taxPct, setTaxPct] = useState('21');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inventoryService
      .getWarehousesList()
      .then((list) => {
        setWarehouses(list);
        if (list[0]) setWarehouseId(list[0].id);
      })
      .catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomers([]);
      return;
    }
    const t = setTimeout(() => {
      customersService
        .getAll({ search: term, limit: 10, isActive: true })
        .then((res) => setCustomers(res.items))
        .catch(() => setCustomers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  useEffect(() => {
    if (!warehouseId) return;
    const t = setTimeout(() => {
      ordersService
        .searchProducts({ search: productSearch.trim() || undefined, warehouseId })
        .then(setProducts)
        .catch(() => setProducts([]));
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch, warehouseId]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          bultos: acc.bultos + l.bultos,
          kg: acc.kg + l.bultos * l.product.weightKg,
          m3: acc.m3 + l.bultos * l.product.volumeM3,
          amount:
            acc.amount + l.bultos * l.product.unitsPerBox * (l.unitPrice ?? l.product.unitPrice ?? 0),
        }),
        { bultos: 0, kg: 0, m3: 0, amount: 0 },
      ),
    [lines],
  );

  const addProduct = (p: CatalogProduct) => {
    setLines((prev) =>
      prev.some((l) => l.product.id === p.id)
        ? prev
        : [...prev, { product: p, bultos: 1, unitPrice: p.unitPrice }],
    );
  };

  const submit = async () => {
    setError(null);
    if (!customer || !addressId || !warehouseId) {
      setError('Seleccione cliente, dirección de entrega y depósito.');
      return;
    }
    if (lines.length === 0) {
      setError('Agregue al menos un artículo.');
      return;
    }
    if (lines.some((l) => !Number.isInteger(l.bultos) || l.bultos < 1)) {
      setError('Las cantidades deben ser enteros mayores a 0.');
      return;
    }
    const over = lines.filter((l) => l.bultos > l.product.availableBultos);
    if (
      over.length > 0 &&
      !confirm(
        `Stock disponible insuficiente para: ${over.map((l) => l.product.sku).join(', ')}. ¿Registrar el pedido igualmente? (quedará con faltantes en el picking)`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const order = await ordersService.create({
        customerId: customer.id,
        addressId,
        sourceWarehouseId: warehouseId,
        deliveryDateFrom: deliveryFrom || undefined,
        deliveryDateTo: deliveryTo || undefined,
        notes: notes.trim() || undefined,
        ...(salesEnabled ? { taxPct: Number(taxPct) || 0 } : {}),
        items: lines.map((l) => ({
          productId: l.product.id,
          bultos: l.bultos,
          ...(salesEnabled && l.unitPrice !== undefined ? { unitPrice: l.unitPrice } : {}),
        })),
      });
      onCreated(order);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear el pedido.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="Nuevo pedido"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Registrar pedido
          </Button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Cliente">
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <div>
                  <p className="font-bold text-white">{customer.name}</p>
                  <p className="text-xs text-slate-400">CUIT {customer.cuit}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setCustomer(null); setAddressId(''); }}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <>
                <input
                  className={inputClass}
                  placeholder="Buscar por nombre, razón social o CUIT (mín. 2 letras)"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customers.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950">
                    {customers.map((c) => (
                      <li key={c.id}>
                        <button
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                          onClick={() => {
                            setCustomer(c);
                            const def = c.addresses.find((a) => a.isDefault) ?? c.addresses[0];
                            setAddressId(def?.id ?? '');
                          }}
                        >
                          <span className="font-bold text-white">{c.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{c.cuit}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Field>

          {customer && (
            <Field label="Dirección de entrega">
              <select className={inputClass} value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                <option value="">Seleccione…</option>
                {customer.addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.alias ? `${a.alias} — ` : ''}{a.address}, {a.city} ({a.province}){a.isDefault ? ' · principal' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Depósito de origen">
            <select
              className={inputClass}
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setLines([]);
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrega desde">
              <input type="date" className={inputClass} value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} />
            </Field>
            <Field label="Entrega hasta">
              <input type="date" className={inputClass} value={deliveryTo} onChange={(e) => setDeliveryTo(e.target.value)} />
            </Field>
          </div>

          <Field label="Observaciones">
            <textarea rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {salesEnabled && (
            <Field label="IVA / impuesto (%)">
              <input inputMode="decimal" className={inputClass} value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Agregar artículos (SKU / descripción / EAN)">
            <input
              className={inputClass}
              placeholder="Buscar artículo…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </Field>
          <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-mono font-bold text-amber-300">{p.sku}</span> {p.name}
                  </p>
                  <p className={`text-xs ${p.availableBultos > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Disponible: {p.availableBultos} bultos
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => addProduct(p)} disabled={lines.some((l) => l.product.id === p.id)}>
                  +
                </Button>
              </li>
            ))}
            {products.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Sin resultados.</li>}
          </ul>

          <div className="rounded-lg border border-slate-700">
            {lines.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Todavía no hay artículos en el pedido.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {lines.map((l, idx) => (
                  <li key={l.product.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono font-bold text-amber-300">{l.product.sku}</span> {l.product.name}
                    </span>
                    <input
                      type="number"
                      min={1}
                      className={`${inputClass} w-20`}
                      value={l.bultos}
                      onChange={(e) => {
                        const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, bultos: v } : x)));
                      }}
                      aria-label={`Bultos de ${l.product.sku}`}
                    />
                    {salesEnabled && (
                      <input
                        inputMode="decimal"
                        className={`${inputClass} w-24`}
                        value={l.unitPrice ?? ''}
                        placeholder="$ unit."
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(',', '.'));
                          setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number.isNaN(v) ? undefined : v } : x)));
                        }}
                        aria-label={`Precio unitario de ${l.product.sku}`}
                      />
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-500">Bultos</p><p className="text-lg font-bold">{totals.bultos}</p></div>
            <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-500">Kg</p><p className="text-lg font-bold">{formatNumber(totals.kg, 1)}</p></div>
            <div className="rounded-lg bg-slate-800 p-2"><p className="text-slate-500">m³</p><p className="text-lg font-bold">{formatNumber(totals.m3, 2)}</p></div>
          </div>
          {salesEnabled && (
            <p className="text-right text-sm text-slate-300">
              Subtotal estimado: <strong>$ {formatNumber(totals.amount, 2)}</strong>
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// ASIGNACIÓN DE PICKERS
// =============================================================================

function AssignPickersModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pickers, setPickers] = useState<ManagedUser[]>([]);
  const [selected, setSelected] = useState<string[]>(order.pickerAssignments.map((a) => a.user.id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    usersService
      .list({ role: 'PICKER', isActive: true })
      .then(setPickers)
      .catch((err) => setError(getApiErrorMessage(err, 'No se pudieron cargar los pickers.')))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (selected.length === 0) {
      setError('Seleccione al menos un picker.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pickingService.assignPickers(order.id, selected);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron asignar los pickers.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`Asignar pickers · ${order.orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving}>Guardar asignación</Button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <p className="mb-3 text-sm text-slate-400">
        Puede asignar varios operarios: todos verán el mismo recorrido y cada línea confirmada desaparece
        de la lista de los demás.
      </p>
      {loading ? (
        <LoadingBlock />
      ) : pickers.length === 0 ? (
        <EmptyState title="No hay pickers activos" description="Cree usuarios con rol Picker." />
      ) : (
        <ul className="space-y-2">
          {pickers.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 hover:bg-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-500"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="font-bold text-white">{p.fullName}</span>
                <span className="text-xs text-slate-500">{p.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
