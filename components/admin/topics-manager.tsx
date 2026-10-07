'use client';

// Topic queue manager: tabs per status, approve/reject/move-to-top/delete,
// and a manual topic submission form.

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, useAdminFetch } from './admin-context';
import {
  Badge,
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
import { topicStatuses } from '@/lib/admin/schemas';

interface Topic {
  id: string;
  keyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  rationale: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
}

export function TopicsManager({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const adminFetch = useAdminFetch();
  const [tab, setTab] = useState<string>('pending');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [intent, setIntent] = useState('informational');
  const [rationale, setRationale] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTopics = useCallback(async () => {
    const d = (await adminFetch('/api/admin/topics')) as {
      topics: Topic[];
      countByStatus: Record<string, number>;
    };
    return d;
  }, [adminFetch]);

  const applyTopics = useCallback((d: { topics: Topic[]; countByStatus: Record<string, number> }) => {
    setTopics(d.topics);
    setCounts(d.countByStatus);
  }, []);

  // Initial load on mount (state updates happen in async callbacks, not in
  // the effect body itself).
  useEffect(() => {
    let cancelled = false;
    fetchTopics()
      .then((d) => {
        if (!cancelled) applyTopics(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load topics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchTopics, applyTopics]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyTopics(await fetchTopics());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Failed to load topics.');
    } finally {
      setLoading(false);
    }
  }, [fetchTopics, applyTopics]);

  const visible = topics.filter((t) => t.status === tab);

  async function act(id: string, action: 'approve' | 'reject' | 'move-top') {
    setError(null);
    try {
      await adminFetch(`/api/admin/topics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === 'move-top'
          ? 'Moved to the top of the queue.'
          : action === 'approve'
            ? 'Topic approved.'
            : 'Topic rejected.',
      );
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Action failed.');
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await adminFetch(`/api/admin/topics/${id}`, { method: 'DELETE' });
      setNotice('Topic deleted.');
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Delete failed.');
    }
  }

  async function addTopic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!keyword.trim()) return setError('Keyword is required.');
    if (!rationale.trim()) return setError('Rationale is required.');
    setAdding(true);
    try {
      await adminFetch('/api/admin/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          searchIntent: intent.trim() || 'informational',
          rationale: rationale.trim(),
          categoryId: categoryId || null,
        }),
      });
      setKeyword('');
      setCategoryId('');
      setIntent('informational');
      setRationale('');
      setShowAdd(false);
      setTab('pending');
      setNotice('Topic added to the pending queue.');
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Could not add topic.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Topic Queue"
        subtitle="Ordered by most recently updated — “Move to top” bumps a topic by refreshing its timestamp."
        actions={
          <button type="button" className={btnPrimary} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Cancel' : '+ Add topic'}
          </button>
        }
      />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      {showAdd && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-bold text-ink">Add topic manually</h2>
          <form onSubmit={addTopic} className="grid gap-4 sm:grid-cols-2">
            <Field label="Keyword">
              <input className={inputClass} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="why does my dog…" maxLength={300} />
            </Field>
            <Field label="Category (optional)">
              <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Search intent">
              <input className={inputClass} value={intent} onChange={(e) => setIntent(e.target.value)} maxLength={60} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Rationale" hint="Why is this a good topic?">
                <textarea className={inputClass} value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} maxLength={5000} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary} disabled={adding}>
                {adding ? 'Adding…' : 'Add to pending queue'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-stone-200">
        {topicStatuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === s
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {s} <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading topics…" />
      ) : visible.length === 0 ? (
        <EmptyState message={`No ${tab} topics.`} />
      ) : (
        <ul className="space-y-3">
          {visible.map((t) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={t.status} />
                      {t.category && (
                        <span className="text-xs font-medium text-ink-soft">{t.category.name}</span>
                      )}
                      <span className="text-xs text-ink-soft">intent: {t.searchIntent}</span>
                      <span className="text-xs text-ink-soft">source: {t.source}</span>
                    </div>
                    <h3 className="mt-1 font-bold text-ink">{t.keyword}</h3>
                    {t.secondaryKeywords.length > 0 && (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Also: {t.secondaryKeywords.join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-ink-soft">{t.rationale}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Updated {new Date(t.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.status === 'pending' && (
                      <>
                        <button type="button" className={btnSecondary} onClick={() => act(t.id, 'approve')}>
                          Approve
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => act(t.id, 'reject')}>
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={btnSecondary}
                      title="Set updatedAt to now so this topic sorts first"
                      onClick={() => act(t.id, 'move-top')}
                    >
                      ↑ Move to top
                    </button>
                    <ConfirmButton
                      onConfirm={() => remove(t.id)}
                      confirmText="Delete this topic?"
                      className={btnDanger}
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
