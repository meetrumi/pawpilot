'use client';

// Contact-message inbox: filter by status, change status, delete.

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, useAdminFetch } from './admin-context';
import {
  Badge,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorAlert,
  PageHeader,
  Spinner,
  SuccessAlert,
  btnDanger,
  btnSecondary,
  inputClass,
} from './ui';

const STATUSES = ['new', 'read', 'replied', 'spam'] as const;

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

export function InboxManager() {
  const adminFetch = useAdminFetch();
  const [filter, setFilter] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    const d = (await adminFetch('/api/admin/inbox')) as {
      messages: Message[];
      countByStatus: Record<string, number>;
    };
    return d;
  }, [adminFetch]);

  const applyMessages = useCallback((d: { messages: Message[]; countByStatus: Record<string, number> }) => {
    setMessages(d.messages);
    setCounts(d.countByStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMessages()
      .then((d) => {
        if (!cancelled) applyMessages(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load inbox.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMessages, applyMessages]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyMessages(await fetchMessages());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  }, [fetchMessages, applyMessages]);

  const visible = filter ? messages.filter((m) => m.status === filter) : messages;

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await adminFetch(`/api/admin/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setNotice(`Marked as ${status}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Update failed.');
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await adminFetch(`/api/admin/inbox/${id}`, { method: 'DELETE' });
      setNotice('Message deleted.');
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Delete failed.');
    }
  }

  return (
    <div>
      <PageHeader title="Inbox" subtitle="Contact-form messages from site visitors." />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-ink">
          Filter:{' '}
          <select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto', display: 'inline-block' }}>
            <option value="">All ({messages.length})</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <Spinner label="Loading inbox…" />
      ) : visible.length === 0 ? (
        <EmptyState message="No messages." />
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <li key={m.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
                    aria-expanded={expanded === m.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={m.status} />
                      <strong className="text-ink">{m.subject || '(no subject)'}</strong>
                    </div>
                    <div className="mt-1 text-sm text-ink-soft">
                      {m.name} · {m.email} · {new Date(m.createdAt).toLocaleString()}
                    </div>
                    {expanded === m.id && (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{m.message}</p>
                    )}
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={inputClass}
                      value={m.status}
                      onChange={(e) => setStatus(m.id, e.target.value)}
                      aria-label="Change status"
                      style={{ width: 'auto' }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ConfirmButton
                      onConfirm={() => remove(m.id)}
                      confirmText="Delete this message?"
                      className={btnDanger}
                    >
                      Delete
                    </ConfirmButton>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
                    >
                      {expanded === m.id ? 'Collapse' : 'Read'}
                    </button>
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
