// frontend/src/app/dashboard/stock-requests/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { stockRequestsService } from '@/services/stock-requests.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDateTime } from '@/lib/format';
import { StockRequest, StockRequestStatus } from '@/types/stock-requests.types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  Tabs,
} from '@/components/ui';

export default function StockRequestsPage() {
  return (
    <ProtectedRoute requiredPermissions={['INVENTORY_MODIFY']}>
      <StockRequestsScreen />
    </ProtectedRoute>
  );
}

function StockRequestsScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<StockRequestStatus>('PENDING');
  const [rows, setRows] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await stockRequestsService.list(tab));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar las solicitudes.'));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (row: StockRequest, approve: boolean) => {
    const notes = prompt(
      approve ? 'Observaciones de la aprobación (opcional):' : 'Motivo del rechazo:',
    );
    if (notes === null) return;
    if (!approve && !notes.trim()) {
      setError('Indique el motivo del rechazo.');
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      if (approve) {
        await stockRequestsService.approve(row.id, notes.trim() || undefined);
        setSuccess(`Ajuste aplicado: ${row.productSku} en ${row.locationCode} (${row.quantityDelta > 0 ? '+' : ''}${row.quantityDelta}).`);
      } else {
        await stockRequestsService.reject(row.id, notes.trim());
        setSuccess(`Solicitud de ${row.productSku} rechazada.`);
      }
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo procesar la solicitud.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Aprobación de ajustes de stock"
        subtitle="Conteos y descuentos registrados por pickers. El stock sólo cambia al aprobar; quien solicita no puede aprobar su propia solicitud."
        actions={<Button variant="secondary" onClick={load} loading={loading}>Actualizar</Button>}
      />
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      <Tabs<StockRequestStatus>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'PENDING', label: 'Pendientes' },
          { key: 'APPROVED', label: 'Aprobadas' },
          { key: 'REJECTED', label: 'Rechazadas' },
        ]}
      />

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="No hay solicitudes en este estado" />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.type === 'COUNT' ? 'sky' : 'purple'}>
                      {r.type === 'COUNT' ? 'Conteo' : 'Descuento'}
                    </Badge>
                    <span className="font-mono font-bold text-amber-300">{r.productSku}</span>
                    <span className="text-white">{r.productName}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {r.warehouseName} · Ubicación <strong>{r.locationCode}</strong> · Lote {r.lotNumber}
                  </p>
                  <p className="mt-1 text-sm">
                    Sistema <strong>{r.systemQty}</strong> → contado <strong>{r.countedQty}</strong>{' '}
                    <span className={r.quantityDelta < 0 ? 'font-bold text-red-400' : 'font-bold text-emerald-400'}>
                      ({r.quantityDelta > 0 ? '+' : ''}{r.quantityDelta})
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Motivo: {r.reason}</p>
                  <p className="text-[11px] text-slate-500">
                    Solicitó {r.requestedBy} · {formatDateTime(r.createdAt)}
                    {r.reviewedBy && ` · Revisó ${r.reviewedBy} · ${formatDateTime(r.reviewedAt)}`}
                    {r.reviewNotes && ` · "${r.reviewNotes}"`}
                  </p>
                </div>
                {r.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      loading={busyId === r.id}
                      disabled={r.requestedById === user?.id && user?.role !== 'ADMIN'}
                      title={r.requestedById === user?.id ? 'No puede aprobar su propia solicitud' : ''}
                      onClick={() => review(r, true)}
                    >
                      Aprobar
                    </Button>
                    <Button variant="danger" size="sm" disabled={busyId === r.id} onClick={() => review(r, false)}>
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
