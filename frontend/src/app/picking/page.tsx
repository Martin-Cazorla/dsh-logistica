// frontend/src/app/picking/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import { pickingService } from '@/services/picking.service';
import { isAxiosError } from 'axios';
import { getApiErrorMessage } from '@/lib/axios';
import { can } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import {
  ORDER_STATUS_LABELS,
  PickingOrderDetail,
  PickingOrderSummary,
  PickShortReason,
  PickTask,
  SHORT_REASON_LABELS,
  ShortageOutcome,
} from '@/types/picking.types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  Tabs,
} from '@/components/ui';

type TabKey = 'PENDING' | 'PICKED';

export default function PickingPage() {
  return (
    <AppShell permissions={['PICKING_EXECUTE']}>
      <PickingScreen />
    </AppShell>
  );
}

function PickingScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PickingOrderSummary[]>([]);
  const [detail, setDetail] = useState<PickingOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('PENDING');
  const [confirmTask, setConfirmTask] = useState<PickTask | null>(null);
  const [confirmQty, setConfirmQty] = useState(0);
  const [shortReason, setShortReason] = useState<PickShortReason | ''>('');
  const [shortNotes, setShortNotes] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ShortageOutcome | null>(null);

  const isSupervisor = can(user?.role, 'PICKING_ASSIGN');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await pickingService.getMyList());
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar los pedidos asignados.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openOrder = async (order: PickingOrderSummary) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      // start() es idempotente: genera el recorrido si el pedido está PENDING
      const data =
        order.status === 'PENDING'
          ? await pickingService.start(order.id)
          : await pickingService.getDetail(order.id);
      setDetail(data);
      setTab('PENDING');
      if (data.plannedWithShortages) {
        setError('Atención: no hay stock suficiente para algunos artículos. Revise los faltantes.');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'No fue posible abrir el pedido.'));
      await loadList();
    } finally {
      setBusy(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      setDetail(await pickingService.getDetail(detail.id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo actualizar el pedido.'));
    } finally {
      setBusy(false);
    }
  };

  const askConfirm = (task: PickTask) => {
    setConfirmTask(task);
    setConfirmQty(task.quantity);
    setShortReason('');
    setShortNotes('');
    setConfirmError(null);
  };

  const isShort = !!confirmTask && confirmQty < confirmTask.quantity;

  const submitConfirm = async () => {
    if (!detail || !confirmTask || busy) return;
    if (isShort && !shortReason) {
      setConfirmError('Seleccione el motivo del faltante.');
      return;
    }
    if (isShort && shortReason === 'OTHER' && !shortNotes.trim()) {
      setConfirmError('Con motivo "Otro" detalle la observación.');
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmError(null);
    try {
      const { shortageOutcome, ...updated } = await pickingService.confirmTask(
        detail.id,
        confirmTask.id,
        {
          quantity: confirmQty,
          ...(isShort ? { shortReason: shortReason as PickShortReason } : {}),
          ...(shortNotes.trim() ? { notes: shortNotes.trim() } : {}),
        },
      );
      setDetail(updated);
      setConfirmTask(null);
      setNotice(shortageOutcome);
      setTab('PENDING');
      if (updated.status === 'PICKED') {
        setSuccess(`Pedido #${updated.orderNumber} completo: pasó a ARMADO.`);
      }
    } catch (err) {
      // 409: la línea ya estaba confirmada (doble toque u otro operario).
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 409) {
        setSuccess('La línea ya estaba confirmada. Se actualizó el recorrido.');
      } else {
        setError(getApiErrorMessage(err, 'No se pudo confirmar la línea.'));
      }
      await refreshDetail();
      setConfirmTask(null);
    } finally {
      setBusy(false);
    }
  };

  const goToTask = (taskId: string) => {
    const task = detail?.pendingTasks.find((t) => t.id === taskId);
    if (task) askConfirm(task);
  };

  // ---------------------------------------------------------------------------
  // LISTA DE PEDIDOS
  // ---------------------------------------------------------------------------
  if (!detail) {
    return (
      <div>
        <PageHeader
          title="Picking"
          subtitle={
            isSupervisor
              ? 'Pedidos pendientes y en armado de todos los operarios.'
              : 'Sus pedidos asignados. El recorrido se genera en una sola dirección por el depósito.'
          }
          actions={
            <Button variant="secondary" onClick={loadList} loading={loading}>
              Actualizar
            </Button>
          }
        />
        {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        {loading ? (
          <LoadingBlock text="Cargando hojas de picking..." />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No tiene pedidos asignados"
            description="Cuando un Gestor le asigne un pedido aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {orders.map((o) => {
              const pct =
                o.progress.totalTasks > 0
                  ? Math.round((o.progress.doneTasks / o.progress.totalTasks) * 100)
                  : 0;
              return (
                <button
                  key={o.id}
                  disabled={busy}
                  onClick={() => openOrder(o)}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-left transition-colors hover:border-amber-500 disabled:opacity-60"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-lg font-black text-white">#{o.orderNumber}</span>
                    <Badge tone={o.status === 'PENDING' ? 'amber' : 'sky'}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 font-bold text-slate-200">{o.customerName}</p>
                  <p className="text-xs text-slate-400">
                    {o.warehouseName} · {o.city}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    {o.totalBultos} bultos · {formatNumber(o.totalWeightKg, 1)} kg
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {o.assignedPickers.map((p) => p.name).join(', ') || 'Sin pickers asignados'}
                  </p>
                  {o.status === 'IN_PICKING' && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {o.progress.doneTasks}/{o.progress.totalTasks} líneas
                      </p>
                    </div>
                  )}
                  <span className="mt-3 block rounded-lg bg-amber-500 py-2 text-center text-sm font-black text-slate-950">
                    {o.status === 'PENDING' ? 'INICIAR RECORRIDO' : 'CONTINUAR'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // DETALLE: RECORRIDO UNIDIRECCIONAL
  // ---------------------------------------------------------------------------
  const nextTask = detail.pendingTasks[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Pedido</p>
          <p className="font-mono text-xl font-black text-amber-400">#{detail.orderNumber}</p>
          <p className="text-sm text-slate-300">
            {detail.customerName} · {detail.warehouseName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refreshDetail} loading={busy}>
            Actualizar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDetail(null);
              loadList();
            }}
          >
            ← Volver
          </Button>
        </div>
      </div>

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {detail.shortages.length > 0 && (
        <Alert kind="warning">
          <p className="font-bold">Faltantes de stock</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {detail.shortages.map((s) => (
              <li key={s.orderItemId}>
                {s.productSku} {s.productName}: pedido {s.requested}, planificado {s.planned}, tomado{' '}
                {s.picked}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {notice && (
        <ShortageNotice notice={notice} onGo={goToTask} onClose={() => setNotice(null)} />
      )}

      {nextTask && tab === 'PENDING' && (
        <div className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
            Próxima parada #{nextTask.sequence}
          </p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{nextTask.location.code}</p>
          <p className="text-sm text-slate-300">
            Zona {nextTask.location.zone} · Módulo {nextTask.location.module} · Nivel{' '}
            {nextTask.location.level}
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {nextTask.quantity} × {nextTask.productSku}{' '}
            <span className="font-normal text-slate-300">{nextTask.productName}</span>
          </p>
          <Button size="lg" className="mt-3 w-full" onClick={() => askConfirm(nextTask)} disabled={busy}>
            CONFIRMAR TOMA
          </Button>
        </div>
      )}

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'PENDING', label: 'Pendientes', count: detail.pendingTasks.length },
          { key: 'PICKED', label: 'Pickeados', count: detail.pickedTasks.length },
        ]}
      />

      {tab === 'PENDING' ? (
        detail.route.length === 0 ? (
          <EmptyState
            title={detail.status === 'PICKED' ? 'Pedido completo' : 'Sin líneas pendientes'}
            description={
              detail.status === 'PICKED'
                ? 'Todas las líneas fueron confirmadas. El pedido pasa a control.'
                : undefined
            }
          />
        ) : (
          <ol className="space-y-4">
            {detail.route.map((group, gi) => (
              <li key={`${group.warehouseId}-${group.zone}-${gi}`}>
                {(gi === 0 || detail.route[gi - 1].warehouseId !== group.warehouseId) && (
                  <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm font-black uppercase tracking-wide text-amber-300">
                    Depósito {group.warehouseName}
                  </p>
                )}
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-slate-100">Zona {gi + 1}</span>
                  {group.zone}
                  <span className="text-amber-400">→ módulos ascendentes</span>
                </div>
                <ul className="space-y-2">
                  {group.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} onConfirm={() => askConfirm(task)} disabled={busy} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )
      ) : detail.pickedTasks.length === 0 ? (
        <EmptyState title="Todavía no hay líneas pickeadas" />
      ) : (
        <ul className="space-y-2">
          {detail.pickedTasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono font-bold text-slate-200">{task.location.code}</p>
                <Badge tone={task.status === 'PICKED' ? 'emerald' : 'red'}>
                  {task.status === 'PICKED' ? 'Completo' : 'Faltante'}
                </Badge>
              </div>
              <p className="text-sm text-slate-300">
                {task.pickedQty}/{task.quantity} × {task.productSku} {task.productName}
              </p>
              {task.shortReason && (
                <p className="text-xs text-red-300">
                  {SHORT_REASON_LABELS[task.shortReason]}
                  {task.notes ? ` · ${task.notes}` : ''}
                </p>
              )}
              {task.replacesLocationCode && (
                <p className="text-xs text-sky-300">↻ Reemplazo de {task.replacesLocationCode}</p>
              )}
              <p className="text-[11px] text-slate-500">
                {task.pickedBy} · {task.pickedAt ? new Date(task.pickedAt).toLocaleTimeString('es-AR') : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!confirmTask}
        title={`Confirmar toma en ${confirmTask?.location.code ?? ''}`}
        onClose={() => setConfirmTask(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTask(null)}>
              Cancelar
            </Button>
            <Button
              variant={isShort ? 'danger' : 'success'}
              onClick={submitConfirm}
              loading={busy}
              disabled={busy}
            >
              {isShort ? 'Confirmar con faltante' : 'Confirmar'}
            </Button>
          </>
        }
      >
        {confirmTask && (
          <div className="text-center">
            <p className="text-sm text-slate-400">
              {confirmTask.productSku} · {confirmTask.productName}
            </p>
            <p className="text-xs text-slate-500">Lote {confirmTask.lotNumber}</p>
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                className="h-16 w-16 rounded-2xl bg-slate-700 text-3xl font-black text-white"
                onClick={() => setConfirmQty((q) => Math.max(0, q - 1))}
                aria-label="Restar un bulto"
              >
                −
              </button>
              <span className="w-24 text-5xl font-black tabular-nums text-white">{confirmQty}</span>
              <button
                className="h-16 w-16 rounded-2xl bg-slate-700 text-3xl font-black text-white"
                onClick={() => setConfirmQty((q) => Math.min(confirmTask.quantity, q + 1))}
                aria-label="Sumar un bulto"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Planificado: {confirmTask.quantity} bultos</p>

            {isShort && (
              <div className="mt-4 space-y-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-left">
                <p className="text-sm font-bold text-red-200">
                  {confirmTask.quantity - confirmQty === 1
                    ? 'Falta 1 bulto'
                    : `Faltan ${confirmTask.quantity - confirmQty} bultos`}
                  . ¿Por qué?
                </p>
                <div className="grid gap-2">
                  {(Object.keys(SHORT_REASON_LABELS) as PickShortReason[]).map((r) => (
                    <label
                      key={r}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                        shortReason === r ? 'border-amber-400 bg-amber-500/10 text-white' : 'border-slate-700 text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="shortReason"
                        className="h-4 w-4 accent-amber-500"
                        checked={shortReason === r}
                        onChange={() => setShortReason(r)}
                      />
                      {SHORT_REASON_LABELS[r]}
                    </label>
                  ))}
                </div>
                <textarea
                  rows={2}
                  maxLength={255}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  placeholder={
                    shortReason === 'OTHER' ? 'Observación (obligatoria)' : 'Observación (opcional), ej.: caja aplastada'
                  }
                  value={shortNotes}
                  onChange={(e) => setShortNotes(e.target.value)}
                />
                <p className="text-[11px] text-slate-400">
                  Se buscará el faltante en otras ubicaciones.
                  {shortReason === 'DAMAGED' || shortReason === 'NOT_FOUND'
                    ? ' Los bultos quedan en cuarentena hasta que un Gestor revise el ajuste.'
                    : ''}
                </p>
              </div>
            )}
            {confirmError && <p className="mt-3 text-sm font-bold text-red-300">{confirmError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function TaskRow({
  task,
  onConfirm,
  disabled,
}: {
  task: PickTask;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 font-mono text-sm font-black text-amber-300">
        {task.sequence}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono font-bold text-white">{task.location.code}</p>
        <p className="truncate text-sm text-slate-300">
          <strong>{task.quantity}</strong> × {task.productSku} {task.productName}
        </p>
        {task.replacesLocationCode && (
          <p className="text-[11px] font-bold text-sky-300">
            ↻ Reemplazo de {task.replacesLocationCode}
            {task.assignedTo ? ` · asignada a ${task.assignedTo.name}` : ' · sin asignar'}
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          Mód. {task.location.module} · Nivel {task.location.level}
          {task.location.comments ? ` · ${task.location.comments}` : ''}
        </p>
      </div>
      <Button variant="success" onClick={onConfirm} disabled={disabled}>
        ✓
      </Button>
    </li>
  );
}

/** Aviso tras confirmar con faltante: reemplazos generados o faltante justificado. */
function ShortageNotice({
  notice,
  onGo,
  onClose,
}: {
  notice: ShortageOutcome;
  onGo: (taskId: string) => void;
  onClose: () => void;
}) {
  const mine = notice.replacements.filter((r) => r.assignedToMe);
  const others = notice.replacements.filter((r) => !r.assignedToMe);
  return (
    <div className="mb-4 rounded-2xl border-2 border-sky-500 bg-sky-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-300">Faltante registrado</p>
        <button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Cerrar aviso">
          ✕
        </button>
      </div>
      {mine.map((r) => (
        <div key={r.taskId} className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold text-white">
            Tomá {r.quantity} {r.quantity === 1 ? 'bulto' : 'bultos'} de{' '}
            <span className="font-mono text-amber-300">{r.locationCode}</span>
          </p>
          <Button size="sm" onClick={() => onGo(r.taskId)}>
            Ir a la tarea
          </Button>
        </div>
      ))}
      {others.map((r) => (
        <p key={r.taskId} className="mt-2 text-sm text-slate-200">
          Se generó una toma de {r.quantity} en <strong>{r.warehouseName}</strong> ({r.locationCode}), pendiente de
          asignación.
        </p>
      ))}
      {notice.uncovered > 0 && (
        <p className="mt-2 text-sm text-amber-200">
          Sin stock alternativo para {notice.uncovered} {notice.uncovered === 1 ? 'bulto' : 'bultos'}: queda como
          faltante justificado.
        </p>
      )}
      {notice.quarantined > 0 && (
        <p className="mt-1 text-xs text-slate-400">
          {notice.quarantined} en cuarentena: se generó una solicitud de ajuste para el Gestor.
        </p>
      )}
    </div>
  );
}
