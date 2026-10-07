import Link from 'next/link';

/** Branded 404 page. */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="text-7xl" aria-hidden="true">
        🐾
      </p>
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-ink">
        This trail went cold
      </h1>
      <p className="mx-auto mt-4 max-w-md text-lg text-ink-soft">
        The page you are looking for does not exist or has moved. Let&apos;s
        get you back to the good stuff.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-brand-700 px-6 py-3 text-sm font-bold text-white hover:bg-brand-800"
        >
          Back to home
        </Link>
        <Link
          href="/search"
          className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-sm font-bold text-ink hover:border-brand-600 hover:text-brand-700"
        >
          Search articles
        </Link>
      </div>
    </main>
  );
}
