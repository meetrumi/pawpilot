'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Route-level error fallback: friendly message + recovery actions. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="text-7xl" aria-hidden="true">
        🐶
      </p>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">
        Something chewed up this page
      </h1>
      <p className="mx-auto mt-4 max-w-md text-lg text-ink-soft">
        An unexpected error stopped this page from loading. Try again, or head
        back home.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-brand-700 px-6 py-3 text-sm font-bold text-white hover:bg-brand-800"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-sm font-bold text-ink hover:border-brand-600 hover:text-brand-700"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
