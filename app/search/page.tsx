import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteTimezone, searchPosts } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { buildCanonical } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Search | PawPilot',
  description: 'Search PawPilot articles.',
  alternates: { canonical: buildCanonical('/search') },
  // Never indexed; excluded from sitemap.xml.
  robots: { index: false, follow: false },
};

/**
 * Cache Components note: this route awaits params/searchParams (request-time
 * data) outside <Suspense>. `instant = false` marks the segment as allowed
 * to block — the documented replacement for on-demand ISR here. Data is
 * still cached hourly via `use cache` + `cacheLife('hours')` in lib/data.ts
 * (with cache tags for on-demand revalidation on publish).
 */
export const instant = false;

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q: qRaw } = await searchParams;
  const q = (qRaw ?? '').trim();
  const [results, timezone] = await Promise.all([
    q ? searchPosts(q, 20) : Promise.resolve([]),
    getSiteTimezone(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Search articles
      </h1>
      <form action="/search" method="get" role="search" className="mt-6 flex" aria-label="Site search">
        <label htmlFor="search-input" className="sr-only">
          Search articles
        </label>
        <input
          id="search-input"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="e.g. puppy biting, litter box…"
          autoComplete="off"
          className="flex-1 rounded-l-xl border border-ink/20 bg-white px-4 py-2.5 text-ink placeholder:text-ink-soft/70 focus:border-brand-600 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-r-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800"
        >
          Search
        </button>
      </form>

      {q ? (
        <section aria-labelledby="results-heading" className="mt-8">
          <h2 id="results-heading" className="text-lg font-bold text-ink">
            {results.length === 0
              ? `No results for “${q}”`
              : `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${q}”`}
          </h2>
          {results.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-ink/10 bg-white p-5"
                >
                  <h3 className="text-lg font-bold leading-snug">
                    <Link
                      href={`/post/${r.slug}`}
                      className="rounded text-ink hover:text-brand-700"
                    >
                      {r.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                    {r.excerpt}
                  </p>
                  {r.publishAt && (
                    <p className="mt-2 text-xs text-ink-soft">
                      <time dateTime={r.publishAt}>
                        {formatDate(r.publishAt, timezone)}
                      </time>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-ink-soft">
              Try different keywords, or browse the{' '}
              <Link href="/" className="font-semibold text-brand-700 underline underline-offset-2">
                latest guides
              </Link>
              .
            </p>
          )}
        </section>
      ) : (
        <p className="mt-8 text-ink-soft">
          Type a question or topic above — for example “puppy biting” or
          “litter box”.
        </p>
      )}
    </main>
  );
}
