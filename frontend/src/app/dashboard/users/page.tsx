// frontend/src/app/dashboard/users/page.tsx

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/axios';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';
import { UserRole } from '@/types/auth.types';
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

const ROLES: UserRole[] = ['ADMIN', 'WAREHOUSE_MANAGER', 'PICKER', 'HELPER', 'DRIVER'];

const ROLE_TONES: Record<UserRole, BadgeTone> = {
  ADMIN: 'red',
  WAREHOUSE_MANAGER: 'amber',
  PICKER: 'sky',
  HELPER: 'purple',
  DRIVER: 'emerald',
};

interface FormState {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  password: string;
}

const EMPTY_FORM: FormState = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'PICKER',
  password: '',
};

export default function UsersPage() {
  return (
    <ProtectedRoute requiredPermissions={['USERS_MANAGE']}>
      <UsersScreen />
    </ProtectedRoute>
  );
}

function UsersScreen() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');

  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await usersService.list());
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar los usuarios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!term ||
          u.fullName.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term)),
    );
  }, [users, search, roleFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setForm({
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      password: '',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await usersService.update(editing.id, {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
        });
        setSuccess(`Usuario ${form.email} actualizado.`);
      } else {
        await usersService.create(form);
        setSuccess(`Usuario ${form.email} creado.`);
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'No se pudo guardar el usuario.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u: ManagedUser) => {
    const verb = u.isActive ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Confirma ${verb} a ${u.fullName}?`)) return;
    setError(null);
    try {
      await usersService.setStatus(u.id, !u.isActive);
      setSuccess(`Usuario ${u.fullName} ${u.isActive ? 'desactivado' : 'reactivado'}.`);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, `No se pudo ${verb} el usuario.`));
    }
  };

  const submitPassword = async () => {
    if (!passwordTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      await usersService.resetPassword(passwordTarget.id, newPassword);
      setSuccess(`Contraseña de ${passwordTarget.fullName} restablecida.`);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'No se pudo restablecer la contraseña.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Usuarios y roles"
        subtitle="Alta y administración de cuentas. Sólo el Administrador puede crear usuarios o cambiar roles."
        actions={<Button onClick={openCreate}>+ Nuevo usuario</Button>}
      />

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className={inputClass}
            placeholder="Buscar por nombre o email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={inputClass}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
          >
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <div className="flex items-center text-xs text-slate-500">
            {filtered.length} de {users.length} usuarios
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock />
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay usuarios para mostrar" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filtered.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">
                      {u.fullName}
                      {u.id === me?.id && (
                        <span className="ml-2 text-xs text-amber-400">(vos)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? 'emerald' : 'slate'}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPasswordTarget(u);
                          setNewPassword('');
                          setFormError(null);
                        }}
                      >
                        Contraseña
                      </Button>
                      {u.id !== me?.id && (
                        <Button
                          size="sm"
                          variant={u.isActive ? 'danger' : 'success'}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.isActive ? 'Desactivar' : 'Reactivar'}
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

      <Modal
        open={formOpen}
        title={editing ? `Editar ${editing.fullName}` : 'Nuevo usuario'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={saving}>
              Guardar
            </Button>
          </>
        }
      >
        {formError && <Alert kind="error">{formError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Apellido">
            <input
              className={inputClass}
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Rol" hint={ROLE_DESCRIPTIONS[form.role]}>
              <select
                className={inputClass}
                value={form.role}
                disabled={editing?.id === me?.id}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!editing && (
            <div className="sm:col-span-2">
              <Field label="Contraseña inicial" hint="Mínimo 8 caracteres con letras y números.">
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!passwordTarget}
        title={`Restablecer contraseña: ${passwordTarget?.fullName ?? ''}`}
        onClose={() => setPasswordTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={submitPassword} loading={saving} disabled={newPassword.length < 8}>
              Restablecer
            </Button>
          </>
        }
      >
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres con letras y números.">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
