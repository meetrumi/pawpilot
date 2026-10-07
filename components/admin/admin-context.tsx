'use client';

// Shared admin client context: CSRF token (from the server session), the
// obscured admin base path, and the logged-in username. Provided by the
// protected admin layout; every mutating fetch goes through useAdminFetch,
// which attaches the x-csrf-token header automatically.

import { createContext, useCallback, useContext } from 'react';

/** Mirrors AdminRole in lib/auth.ts (kept local so this client module never
 * imports the server-only auth module). */
export type AdminClientRole = 'superadmin' | 'editor';

export interface AdminContextValue {
  csrf: string;
  basePath: string;
  username: string;
  role: AdminClientRole;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  value,
  children,
}: {
  value: AdminContextValue;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/** fetch() bound to the admin CSRF token. Throws AdminApiError on non-2xx. */
export function useAdminFetch() {
  const { csrf } = useAdmin();
  return useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const headers = new Headers(init?.headers);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        headers.set('x-csrf-token', csrf);
      }
      const res = await fetch(path, { ...init, headers });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const message =
          (data as { error?: string } | null)?.error ??
          `Request failed with status ${res.status}.`;
        throw new AdminApiError(res.status, message, data);
      }
      return data;
    },
    [csrf],
  );
}
