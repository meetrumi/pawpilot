// Root layout for the internal admin area. Everything under /internal-admin is
// internal-only: never indexed, never linked publicly.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InternalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
