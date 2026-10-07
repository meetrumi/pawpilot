import Link from 'next/link';
import { cacheLife } from 'next/cache';
import { getCategories } from '@/lib/data';

/**
 * Current year, cached daily. (Next 16 prerendering forbids `new Date()`
 * directly in a server component — it must be cached or request-time.)
 */
async function currentYear(): Promise<number> {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}

/** Site footer: nav, legal links, editorial disclosure. */
export async function Footer() {
  const [categories, year] = await Promise.all([getCategories(), currentYear()]);
  return (
    <footer className="mt-16 border-t border-ink/10 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-xl font-extrabold tracking-tight text-ink">
            <span aria-hidden="true">🐾 </span>
            Paw<span className="text-brand-600">Pilot</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Happy pets, confident owners.
          </p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-soft">
            <strong className="text-ink">Editorial disclosure:</strong> PawPilot
            is an independent publication. Some articles contain affiliate
            links — if you buy through them, we may earn a commission at no
            extra cost to you. This never influences our recommendations.
          </p>
        </div>
        <nav aria-label="Topics">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            Topics
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal and about">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
            About
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/about" className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline">
                About PawPilot
              </Link>
            </li>
            <li>
              <Link href="/contact" className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline">
                Terms of Use
              </Link>
            </li>
            <li>
              <Link href="/disclaimer" className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline">
                Disclaimer
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-ink-soft sm:px-6">
          © {year} PawPilot. All rights reserved. Pet health content is
          educational only and never replaces your veterinarian — see our{' '}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:text-brand-700">
            disclaimer
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
