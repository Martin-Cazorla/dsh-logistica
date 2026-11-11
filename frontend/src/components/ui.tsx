// frontend/src/components/ui.tsx

'use client';

import React, { useEffect } from 'react';

/**
 * Primitivas visuales compartidas (tema oscuro slate + ámbar).
 * Mantenerlas aquí evita repetir clases Tailwind en cada pantalla.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
  title,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-700 bg-slate-800/80 p-4 shadow-lg sm:p-5 ${className}`}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-white">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
  secondary:
    'bg-slate-700 text-slate-100 hover:bg-slate-600 border border-slate-600',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-700',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3.5 text-base',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-3.5 w-3.5' : 'h-8 w-8 text-amber-400'}`}
      aria-label="Cargando"
    />
  );
}

export function LoadingBlock({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-slate-400">
      <Spinner />
      {text}
    </div>
  );
}

export function Alert({
  kind,
  children,
  onClose,
}: {
  kind: 'error' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const styles = {
    error: 'border-red-500/60 bg-red-950/70 text-red-200',
    success: 'border-emerald-500/60 bg-emerald-950/70 text-emerald-200',
    warning: 'border-amber-500/60 bg-amber-950/60 text-amber-200',
    info: 'border-sky-500/60 bg-sky-950/60 text-sky-200',
  };
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${styles[kind]}`}
    >
      <div>{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-xs font-bold opacity-70 hover:opacity-100"
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-700 text-slate-200 border-slate-600',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  red: 'bg-red-500/15 text-red-300 border-red-500/40',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
};

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 px-4 py-10 text-center">
      <p className="font-bold text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'text-white',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-extrabold tabular-nums ${tone}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  danger = 100,
}: {
  value: number;
  max: number;
  danger?: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const raw = max > 0 ? (value / max) * 100 : 0;
  const color =
    raw > danger ? 'bg-red-500' : raw > 85 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-900 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
            value === tab.key
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 opacity-75">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
