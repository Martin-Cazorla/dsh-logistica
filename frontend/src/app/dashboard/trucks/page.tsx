// frontend/src/app/dashboard/trucks/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { trucksService } from '@/services/trucks.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatNumber } from '@/lib/format';
import { Truck } from '@/types/trucks.types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  Modal,
  PageHeader,
} from '@/components/ui';

interface FormState {
  brand: string;
  model: string;
  plate: string;
  capacityM3: string;
  maxLoadKg: string;
  notes: string;
}

const EMPTY: FormState = {
  brand: '',
  model: '',
  plate: '',
  capacityM3: '',
  maxLoadKg: '',
  notes: '',
};

const toNumber = (v: string) => Number(v.replace(',', '.'));

export default function TrucksPage() {
  return (
    <ProtectedRoute requiredPermissions={['FLEET_MANAGE']}>
      <TrucksScreen />
    </ProtectedRoute>
  );
}

function TrucksScreen() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Truck | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrucks(await trucksService.list());
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar la flota.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (truck: Truck | null) => {
    setEditing(truck);
    setForm(
      truck
        ? {
            brand: truck.brand,
            model: truck.model,
            plate: truck.plate,
            capacityM3: String(truck.capacityM3),
            maxLoadKg: String(truck.maxLoadKg),
            notes: truck.notes ?? '',
          }
        : EMPTY,
    );
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    const capacityM3 = toNumber(form.capacityM3);
    const maxLoadKg = toNumber(form.maxLoadKg);
    if (!form.brand.trim() || !form.model.trim() || !form.plate.trim()) {
      setFormError('Marca, modelo y patente son obligatorios.');
      return;
    }
    if (!(capacityM3 > 0) || !(maxLoadKg > 0)) {
      setFormError('Las capacidades deben ser números mayores a 0.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        plate: form.plate.trim(),
        capacityM3,
        maxLoadKg,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await trucksService.update(editing.id, payload);
        setSuccess(`Camión ${payload.plate.toUpperCase()} actualizado.`);
      } else {
        await trucksService.create(payload);
        setSuccess(`Camión ${payload.plate.toUpperCase()} registrado.`);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'No se pudo guardar el camión.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (truck: Truck) => {
    setError(null);
    try {
      await trucksService.update(truck.id, { isActive: !truck.isActive });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cambiar el estado del camión.'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Flota de camiones"
        subtitle="Unidades disponibles para consolidar hojas de ruta, con su capacidad volumétrica y de carga."
        actions={<Button onClick={() => openForm(null)}>+ Nuevo camión</Button>}
      />

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {loading ? (
        <LoadingBlock />
      ) : trucks.length === 0 ? (
        <EmptyState
          title="No hay camiones registrados"
          description="Registre al menos una unidad para poder crear hojas de ruta."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {trucks.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border bg-slate-800 p-4 ${t.isActive ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-black tracking-widest text-amber-300">
                    {t.plate}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {t.brand} {t.model}
                  </p>
                </div>
                <Badge tone={t.isActive ? 'emerald' : 'slate'}>
                  {t.isActive ? 'Activo' : 'Baja'}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-900 p-2">
                  <dt className="text-[11px] uppercase text-slate-500">Capacidad</dt>
                  <dd className="font-bold text-white">{formatNumber(t.capacityM3, 2)} m³</dd>
                </div>
                <div className="rounded-lg bg-slate-900 p-2">
                  <dt className="text-[11px] uppercase text-slate-500">Carga máx.</dt>
                  <dd className="font-bold text-white">{formatNumber(t.maxLoadKg)} kg</dd>
                </div>
              </dl>
              {t.activeRoute && (
                <p className="mt-2 text-xs text-sky-300">
                  En hoja {t.activeRoute.code} ({t.activeRoute.status})
                </p>
              )}
              {t.notes && <p className="mt-2 text-xs text-slate-400">{t.notes}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openForm(t)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant={t.isActive ? 'danger' : 'success'}
                  onClick={() => toggleActive(t)}
                >
                  {t.isActive ? 'Dar de baja' : 'Reactivar'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={editing ? `Editar ${editing.plate}` : 'Nuevo camión'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Guardar
            </Button>
          </>
        }
      >
        {formError && <Alert kind="error">{formError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marca">
            <input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </Field>
          <Field label="Modelo">
            <input className={inputClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </Field>
          <Field label="Patente" hint="AAA123 o AA123AA">
            <input
              className={`${inputClass} font-mono uppercase`}
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
            />
          </Field>
          <Field label="Capacidad (m³)">
            <input inputMode="decimal" className={inputClass} value={form.capacityM3} onChange={(e) => setForm({ ...form, capacityM3: e.target.value })} />
          </Field>
          <Field label="Carga máxima (kg)">
            <input inputMode="decimal" className={inputClass} value={form.maxLoadKg} onChange={(e) => setForm({ ...form, maxLoadKg: e.target.value })} />
          </Field>
          <Field label="Observaciones">
            <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
