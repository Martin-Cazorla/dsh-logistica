// dsh-logistica/src/orders/mappers/order-print.mapper.ts

import {
  OrderStatus,
  PickShortReason,
  PickTaskStatus,
  ShippingType,
} from '@prisma/client';

/**
 * Hoja de preparación del pedido (vista de impresión A4).
 * Consumida por frontend/src/app/print/orders/[id]/page.tsx.
 *
 * Cantidades: las tomas ya confirmadas muestran lo efectivamente PREPARADO;
 * las pendientes, lo planificado. Los reemplazos generados ante un faltante
 * suman a la línea; el faltante se cita sólo si quedó algo sin cubrir.
 */

export interface OrderPrintRow {
  sequence: number | null;
  sku: string;
  description: string;
  bultos: number;
  units: number;
  /** null: bultos sin stock asignado. */
  location: string | null;
  warehouse: string | null;
  /** Toma de reemplazo generada ante un faltante. */
  replacement: boolean;
}

export interface OrderPrintGroup {
  warehouse: { id: string; name: string; code: string } | null;
  totalBultos: number;
  rows: OrderPrintRow[];
}

export interface OrderPrintShortage {
  sku: string;
  description: string;
  requested: number;
  prepared: number;
  missing: number;
  /** "1 roto / en mal estado — RACK-A4 (Murguindo) · \"caja aplastada\"" */
  details: string[];
  /** Texto listo para imprimir. */
  text: string;
}

export interface OrderPrintSheet {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  customerCuit: string;
  deliveryAddress: string;
  estimatedDeliveryDate: string | null;
  deliveryDateFrom: string | null;
  deliveryDateTo: string | null;
  sellerName: string | null;
  notes: string | null;
  shippingType: ShippingType;
  /** "Transporte DSH" o "Expreso: <nombre>". */
  shippingLabel: string;
  /** Total real: preparado (tomas confirmadas) + planificado (pendientes). */
  totalBultos: number;
  /** Total pedido; se imprime "(pedido: N)" si difiere del real. */
  orderedBultos: number;
  /** Quienes confirmaron tomas; si aún nadie, los asignados; si no, vacío. */
  preparedBy: string[];
  groups: OrderPrintGroup[];
  shortages: OrderPrintShortage[];
}

type UserName = { id: string; firstName: string; lastName: string };

interface PrintSource {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
  notes: string | null;
  shippingType: ShippingType;
  estimatedDeliveryDate: Date | null;
  deliveryDateFrom: Date | null;
  deliveryDateTo: Date | null;
  totalBultos: number;
  customer: { name: string; cuit: string };
  deliveryAddress: {
    alias: string | null;
    address: string;
    city: string;
    province: string;
    zipCode: string;
  };
  seller: UserName | null;
  transport: { name: string } | null;
  pickerAssignments: Array<{ user: UserName }>;
  items: Array<{
    id: string;
    bultos: number;
    product: { sku: string; name: string; unitsPerBox: number };
  }>;
  pickTasks: Array<{
    orderItemId: string;
    sequence: number;
    quantity: number;
    pickedQty: number;
    status: PickTaskStatus;
    shortReason: PickShortReason | null;
    notes: string | null;
    replacesTaskId: string | null;
    pickedBy: UserName | null;
    location: {
      code: string;
      warehouse: { id: string; name: string; code: string };
    };
  }>;
}

const SHORT_REASON_TEXT: Record<PickShortReason, string> = {
  DAMAGED: 'en mal estado',
  NOT_FOUND: 'no estaba en la ubicación',
  OTHER: 'otro motivo',
};

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

export function shippingLabel(
  type: ShippingType,
  transportName: string | null | undefined,
): string {
  return type === ShippingType.EXPRESO
    ? `Expreso: ${transportName ?? 'sin indicar'}`
    : 'Transporte DSH';
}

/** Bultos que cuenta una toma: preparado si se confirmó, planificado si no. */
function effectiveQty(task: PrintSource['pickTasks'][number]): number {
  return task.status === PickTaskStatus.PENDING ? task.quantity : task.pickedQty;
}

export function toOrderPrintSheet(order: PrintSource): OrderPrintSheet {
  const itemById = new Map(order.items.map((i) => [i.id, i]));
  const groups: OrderPrintGroup[] = [];
  const groupByWarehouse = new Map<string, OrderPrintGroup>();
  const coveredByItem = new Map<string, number>();

  // Tareas en el orden del recorrido: los depósitos aparecen en el orden en
  // que se visitan.
  for (const task of order.pickTasks) {
    const item = itemById.get(task.orderItemId);
    if (!item) continue;
    const qty = effectiveQty(task);
    coveredByItem.set(item.id, (coveredByItem.get(item.id) ?? 0) + qty);
    if (qty === 0) continue; // toma confirmada sin bultos: sólo incidencia

    const wh = task.location.warehouse;
    let group = groupByWarehouse.get(wh.id);
    if (!group) {
      group = { warehouse: wh, totalBultos: 0, rows: [] };
      groupByWarehouse.set(wh.id, group);
      groups.push(group);
    }
    group.rows.push({
      sequence: task.sequence,
      sku: item.product.sku,
      description: item.product.name,
      bultos: qty,
      units: qty * item.product.unitsPerBox,
      location: task.location.code,
      warehouse: wh.name,
      replacement: !!task.replacesTaskId,
    });
    group.totalBultos += qty;
  }

  const shortages: OrderPrintShortage[] = [];
  const unassigned: OrderPrintRow[] = [];

  for (const item of order.items) {
    const covered = coveredByItem.get(item.id) ?? 0;
    const shortfall = item.bultos - covered;
    if (shortfall <= 0) continue;

    // Parte del faltante explicada por tomas con faltante (motivo cargado)
    const incidents = order.pickTasks.filter(
      (t) =>
        t.orderItemId === item.id &&
        t.status === PickTaskStatus.SHORT &&
        t.quantity > t.pickedQty,
    );
    const explainedTotal = incidents.reduce(
      (acc, t) => acc + (t.quantity - t.pickedQty),
      0,
    );
    const explained = Math.min(shortfall, explainedTotal);

    if (explained > 0) {
      const details = incidents.map((t) => {
        const reason = t.shortReason
          ? SHORT_REASON_TEXT[t.shortReason]
          : 'sin motivo';
        const note = t.notes ? ` · "${t.notes}"` : '';
        return `${t.quantity - t.pickedQty} ${reason} — ${t.location.code} (${t.location.warehouse.name})${note}`;
      });
      shortages.push({
        sku: item.product.sku,
        description: item.product.name,
        requested: item.bultos,
        prepared: covered,
        missing: explained,
        details,
        text: `${item.product.sku} - ${item.product.name}: se prepararon ${covered} de ${item.bultos} bultos (${details.join('; ')})`,
      });
    }

    const pending = shortfall - explained;
    if (pending > 0) {
      unassigned.push({
        sequence: null,
        sku: item.product.sku,
        description: item.product.name,
        bultos: pending,
        units: pending * item.product.unitsPerBox,
        location: null,
        warehouse: null,
        replacement: false,
      });
    }
  }

  // Bultos sin stock asignado (pedidos históricos / cancelados)
  if (unassigned.length > 0) {
    unassigned.sort((a, b) => a.sku.localeCompare(b.sku));
    groups.push({
      warehouse: null,
      totalBultos: unassigned.reduce((acc, r) => acc + r.bultos, 0),
      rows: unassigned,
    });
  }

  // "Preparó": quienes confirmaron tomas (en orden de recorrido); si todavía
  // nadie confirmó, los pickers asignados; si no hay, queda en blanco.
  const pickers = new Map<string, string>();
  for (const t of order.pickTasks) {
    if (t.pickedBy) pickers.set(t.pickedBy.id, fullName(t.pickedBy));
  }
  if (pickers.size === 0) {
    for (const a of order.pickerAssignments) {
      pickers.set(a.user.id, fullName(a.user));
    }
  }

  const a = order.deliveryAddress;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer.name,
    customerCuit: order.customer.cuit,
    deliveryAddress: `${a.alias ? `${a.alias} — ` : ''}${a.address}, ${a.city}, ${a.province}${a.zipCode ? ` (CP ${a.zipCode})` : ''}`,
    estimatedDeliveryDate: isoDate(order.estimatedDeliveryDate),
    deliveryDateFrom: isoDate(order.deliveryDateFrom),
    deliveryDateTo: isoDate(order.deliveryDateTo),
    sellerName: order.seller ? fullName(order.seller) : null,
    notes: order.notes,
    shippingType: order.shippingType,
    shippingLabel: shippingLabel(order.shippingType, order.transport?.name),
    totalBultos: groups
      .filter((g) => g.warehouse !== null)
      .reduce((acc, g) => acc + g.totalBultos, 0),
    orderedBultos: order.items.reduce((acc, i) => acc + i.bultos, 0),
    preparedBy: [...pickers.values()],
    groups,
    shortages,
  };
}
