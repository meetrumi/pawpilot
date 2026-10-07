// Protected admin layout: requires a valid session, otherwise redirects to
// the login page. Provides the AdminProvider (CSRF token + base path) and the
// nav shell to every admin page.

import { redirect } from 'next/navigation';
import { adminBasePath, getSession } from '@/lib/auth';
import { AdminProvider } from '@/components/admin/admin-context';
import { AdminShell } from '@/components/admin/admin-shell';

// The admin area is fully request-time: it reads the session cookie and live
// database state, so it must be allowed to block (no prerendering).
export const instant = false;

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect(`${adminBasePath()}/login`);
  }
  return (
    <AdminProvider
      value={{ csrf: session.csrf, basePath: adminBasePath(), username: session.username }}
    >
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
