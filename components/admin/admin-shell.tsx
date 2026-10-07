'use client';

// Admin shell: sidebar nav + top bar + logout. Client component so it can read
// the admin base path / CSRF token from context. Rendered by the protected
// admin layout after the session check.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminApiError, useAdmin, useAdminFetch } from './admin-context';

const NAV: Array<{ href: string; label: string; roles?: Array<'superadmin' | 'editor'> }> = [
  { href: '', label: 'Dashboard' },
  { href: '/posts', label: 'Posts' },
  { href: '/topics', label: 'Topic Queue', roles: ['superadmin'] },
  { href: '/agent', label: 'Agent', roles: ['superadmin'] },
  { href: '/media', label: 'Media' },
  { href: '/categories', label: 'Categories', roles: ['superadmin'] },
  { href: '/tags', label: 'Tags', roles: ['superadmin'] },
  { href: '/authors', label: 'Authors', roles: ['superadmin'] },
  { href: '/inbox', label: 'Inbox' },
  { href: '/settings', label: 'Settings', roles: ['superadmin'] },
  { href: '/team', label: 'Team', roles: ['superadmin'] },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { basePath, username, role } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const adminFetch = useAdminFetch();
  const [loggingOut, setLoggingOut] = useState(false);
  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(role));

  async function logout() {
    setLoggingOut(true);
    try {
      await adminFetch('/api/admin/logout', { method: 'POST' });
    } catch (err) {
      // Even if the API call fails, drop the local session and leave.
      if (!(err instanceof AdminApiError)) {
        console.error('logout failed', err);
      }
    } finally {
      router.replace(`${basePath}/login`);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href={`${basePath}/`}
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              🐾
            </span>
            PawPilot Admin
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">
              Signed in as <strong className="text-ink">{username}</strong>
            </span>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-60"
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
        <nav aria-label="Admin" className="border-t border-stone-100">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {visibleNav.map((item) => {
              const href = `${basePath}${item.href === '' ? '/' : item.href}`;
              // pathname is the rewritten /internal-admin/* path; compare suffixes.
              const active =
                item.href === ''
                  ? pathname === '/internal-admin' || pathname === '/internal-admin/'
                  : pathname === `/internal-admin${item.href}` ||
                    pathname.startsWith(`/internal-admin${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${
                    active
                      ? 'border-brand-700 text-brand-800'
                      : 'border-transparent text-ink-soft hover:border-stone-300 hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-ink-soft">
        PawPilot admin · internal only
      </footer>
    </div>
  );
}
