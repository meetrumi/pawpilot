'use client';

// Small shared UI primitives for the admin panel. Tailwind-based, no extra deps.

import { useState } from 'react';

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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </Card>
  );
}

const BADGE_COLORS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-700',
  review: 'bg-amber-100 text-amber-800',
  scheduled: 'bg-sky-100 text-sky-800',
  published: 'bg-brand-100 text-brand-800',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-brand-100 text-brand-800',
  rejected: 'bg-red-100 text-red-800',
  used: 'bg-stone-100 text-stone-600',
  running: 'bg-sky-100 text-sky-800',
  success: 'bg-brand-100 text-brand-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-amber-100 text-amber-800',
  new: 'bg-sky-100 text-sky-800',
  read: 'bg-stone-100 text-stone-700',
  replied: 'bg-brand-100 text-brand-800',
  spam: 'bg-red-100 text-red-800',
};

export function Badge({ value }: { value: string }) {
  const color = BADGE_COLORS[value] ?? 'bg-stone-100 text-stone-700';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {value}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400';

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
      {message}
    </div>
  );
}

export function SuccessAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
      {message}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-soft" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-ink-soft">
      {message}
    </div>
  );
}

/** Button that asks for confirmation before running an async action. */
export function ConfirmButton({
  children,
  onConfirm,
  confirmText = 'Are you sure?',
  className = '',
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      className={className}
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

export const btnPrimary =
  'rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60';
export const btnSecondary =
  'rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60';
export const btnDanger =
  'rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60';
export const btnDangerSolid =
  'rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60';
