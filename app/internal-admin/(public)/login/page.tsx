// Admin login page. Redirects to the dashboard when already signed in.

import { redirect } from 'next/navigation';
import { adminBasePath, getSession } from '@/lib/auth';
import { LoginForm } from '@/components/admin/login-form';

// Request-time route: checks the session cookie, so no prerendering.
export const instant = false;

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session) {
    redirect(`${adminBasePath()}/`);
  }
  const basePath = adminBasePath();
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-2xl text-white">
            🐾
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">PawPilot Admin</h1>
          <p className="mt-1 text-sm text-ink-soft">Sign in to manage the site.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <LoginForm basePath={basePath} />
        </div>
      </div>
    </div>
  );
}
