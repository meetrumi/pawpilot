'use client';

// Generic CRUD manager for categories, tags and authors. The parent page
// supplies the API resource name and the field descriptors.

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, useAdminFetch } from './admin-context';
import {
  Card,
  ConfirmButton,
  EmptyState,
  ErrorAlert,
  Field,
  PageHeader,
  Spinner,
  SuccessAlert,
  btnDanger,
  btnPrimary,
  btnSecondary,
  inputClass,
} from './ui';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'url';
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}

interface Item {
  id: string;
  name: string;
  slug: string;
  _count?: Record<string, number>;
  [key: string]: unknown;
}

const RESPONSE_KEY: Record<string, string> = {
  categories: 'categories',
  tags: 'tags',
  authors: 'authors',
};

export function TaxonomyManager({
  resource,
  title,
  subtitle,
  singular,
  fields,
}: {
  resource: 'categories' | 'tags' | 'authors';
  title: string;
  subtitle: string;
  singular: string;
  fields: FieldDef[];
}) {
  const adminFetch = useAdminFetch();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const d = (await adminFetch(`/api/admin/${resource}`)) as Record<string, Item[]>;
    return d[RESPONSE_KEY[resource]] ?? [];
  }, [adminFetch, resource]);

  useEffect(() => {
    let cancelled = false;
    fetchItems()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchItems]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchItems());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  function openCreate() {
    const blank: Record<string, string> = {};
    for (const f of fields) blank[f.key] = f.defaultValue ?? '';
    setForm(blank);
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item: Item) {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const v = item[f.key];
      values[f.key] = typeof v === 'string' ? v : (v ?? '').toString();
    }
    setForm(values);
    setEditing(item);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    for (const f of fields) {
      if (f.required && !form[f.key]?.trim()) {
        return setError(`${f.label} is required.`);
      }
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const f of fields) body[f.key] = form[f.key]?.trim() ?? '';
      // Empty slug => server derives it from the name.
      if (!body.slug) delete body.slug;
      await adminFetch(editing ? `/api/admin/${resource}/${editing.id}` : `/api/admin/${resource}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNotice(editing ? `${singular} updated.` : `${singular} created.`);
      setShowForm(false);
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Item) {
    setError(null);
    try {
      await adminFetch(`/api/admin/${resource}/${item.id}`, { method: 'DELETE' });
      setNotice(`${singular} deleted.`);
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Delete failed.');
    }
  }

  function usageText(item: Item): string {
    if (!item._count) return '—';
    return Object.entries(item._count)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button type="button" className={btnPrimary} onClick={openCreate}>
            + New {singular.toLowerCase()}
          </button>
        }
      />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-bold text-ink">
            {editing ? `Edit ${singular.toLowerCase()}` : `New ${singular.toLowerCase()}`}
          </h2>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <Field label={f.label} hint={f.hint}>
                  {f.type === 'textarea' ? (
                    <textarea
                      className={inputClass}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                      rows={4}
                    />
                  ) : (
                    <input
                      type={f.type === 'text' ? 'text' : f.type}
                      className={`${inputClass} ${f.key === 'slug' ? 'font-mono' : ''}`}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                  )}
                </Field>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={btnPrimary} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : `Create ${singular.toLowerCase()}`}
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label={`Loading ${title.toLowerCase()}…`} />
      ) : items.length === 0 ? (
        <EmptyState message={`No ${title.toLowerCase()} yet.`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Usage</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-semibold text-ink">{item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">{item.slug}</td>
                  <td className="px-4 py-3 text-ink-soft">{usageText(item)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" className={btnSecondary} onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <ConfirmButton
                        onConfirm={() => remove(item)}
                        confirmText={`Delete "${item.name}"?`}
                        className={btnDanger}
                      >
                        Delete
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
