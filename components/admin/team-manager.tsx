'use client';

// Team manager (super-admin only): list child admin users, create new ones,
// reset passwords, activate/deactivate, delete.

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

interface TeamUser {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export function TeamManager() {
  const adminFetch = useAdminFetch();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Reset-password form (per row)
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    const d = (await adminFetch('/api/admin/team')) as { users: TeamUser[] };
    return d.users;
  }, [adminFetch]);

  const applyUsers = useCallback((list: TeamUser[]) => {
    setUsers(list);
  }, []);

  // Initial load on mount (state updates happen in async callbacks, not in
  // the effect body itself).
  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((list) => {
        if (!cancelled) applyUsers(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load team users.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUsers, applyUsers]);

  const refresh = useCallback(async () => {
    try {
      applyUsers(await fetchUsers());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Failed to load team users.');
    }
  }, [fetchUsers, applyUsers]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await adminFetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          isActive: newActive,
        }),
      });
      setNotice(`User "${newUsername.trim()}" created.`);
      setNewUsername('');
      setNewPassword('');
      setNewActive(true);
      await refresh();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: TeamUser) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const d = (await adminFetch(`/api/admin/team/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      })) as { user: TeamUser };
      setUsers((prev) => prev.map((u) => (u.id === user.id ? d.user : u)));
      setNotice(
        d.user.isActive
          ? `User "${d.user.username}" activated.`
          : `User "${d.user.username}" deactivated — they can no longer log in.`,
      );
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  }

  async function doResetPassword(e: React.FormEvent, user: TeamUser) {
    e.preventDefault();
    if (resetPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminFetch(`/api/admin/team/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      setNotice(`Password reset for "${user.username}". Share the new password with them directly.`);
      setResettingId(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: TeamUser) {
    setError(null);
    setNotice(null);
    try {
      await adminFetch(`/api/admin/team/${user.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setNotice(`User "${user.username}" deleted.`);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to delete user.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Child admin accounts. Editors can manage posts, media, and the inbox — agent controls, settings, and this page stay with the super-admin."
      />
      {error && <ErrorAlert message={error} />}
      {notice && <SuccessAlert message={notice} />}

      <Card>
        <h2 className="text-base font-bold text-ink">Add team member</h2>
        <form onSubmit={createUser} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Username" hint="3–60 chars: letters, numbers, dots, underscores, hyphens">
            <input
              className={inputClass}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              minLength={3}
              maxLength={60}
              autoComplete="off"
            />
          </Field>
          <Field label="Password" hint="Minimum 8 characters">
            <input
              className={inputClass}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={newActive}
              onChange={(e) => setNewActive(e.target.checked)}
              className="h-4 w-4 rounded accent-brand-700"
            />
            Active (can log in immediately)
          </label>
          <div>
            <button type="submit" disabled={creating} className={btnPrimary}>
              {creating ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState message="No team members yet. Create the first editor account above to share the content workload." />
        ) : (
          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-ink">{user.username}</h2>
                  <Badge value={user.isActive ? 'active' : 'deactivated'} />
                  <Badge value={user.role} />
                  <span className="text-xs text-ink-soft">
                    Added by {user.createdBy} · {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(user)}
                    disabled={saving}
                    className={btnSecondary}
                  >
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  {resettingId === user.id ? (
                    <form
                      onSubmit={(e) => doResetPassword(e, user)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        className={inputClass}
                        type="password"
                        placeholder="New password (min 8 chars)"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        style={{ width: '16rem' }}
                      />
                      <button type="submit" disabled={saving} className={btnPrimary}>
                        Save password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResettingId(null);
                          setResetPassword('');
                        }}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setResettingId(user.id)}
                      className={btnSecondary}
                    >
                      Reset password
                    </button>
                  )}
                  <ConfirmButton
                    onConfirm={() => deleteUser(user)}
                    confirmText={`Delete team user "${user.username}"? This cannot be undone.`}
                    className={btnDanger}
                  >
                    Delete
                  </ConfirmButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
