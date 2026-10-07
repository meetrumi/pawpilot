'use client';

// Admin login form. Fetches /api/admin/totp-status to decide whether to show
// the TOTP field (the endpoint leaks nothing about the secret itself).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorAlert, inputClass, btnPrimary } from './ui';

export function LoginForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/totp-status')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTotpEnabled(d.totpEnabled === true);
      })
      .catch(() => {
        /* TOTP field stays hidden; server still enforces it. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLocked(false);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, token: token || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 || data.locked) {
          setLocked(true);
          const waitMin = data.retryAfterMs
            ? Math.ceil(data.retryAfterMs / 60000)
            : null;
          setError(
            `Too many failed attempts — login is temporarily locked.${
              waitMin ? ` Try again in about ${waitMin} minute${waitMin === 1 ? '' : 's'}.` : ''
            }`,
          );
        } else {
          setError(data.error || 'Login failed. Check your credentials.');
        }
        return;
      }
      router.replace(`${basePath}/`);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorAlert message={error} />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Username</span>
        <input
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          disabled={busy || locked}
          autoFocus
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Password</span>
        <input
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={busy || locked}
        />
      </label>
      {totpEnabled && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink">
            Authenticator code
          </span>
          <input
            className={inputClass}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            required
            disabled={busy || locked}
          />
        </label>
      )}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={busy || locked}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-xs text-ink-soft">
        Protected area. Every attempt is logged.
      </p>
    </form>
  );
}
