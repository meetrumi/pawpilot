import Link from 'next/link';
import { getCategories } from '@/lib/data';

/** Site header: skip link, brand, category nav, site search. */
export async function Header() {
  const categories = await getCategories();
  return (
    <header className="border-b border-ink/10 bg-cream">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg text-2xl font-extrabold tracking-tight text-ink"
          aria-label="PawPilot home"
        >
          <span aria-hidden="true" className="text-3xl">
            🐾
          </span>
          <span>
            Paw<span className="text-brand-600">Pilot</span>
          </span>
        </Link>
        <nav aria-label="Categories" className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
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
        <form
          action="/search"
          method="get"
          role="search"
          aria-label="Site search"
          className="order-2 ml-auto flex lg:order-3 lg:ml-0"
        >
          <label htmlFor="site-search" className="sr-only">
            Search articles
          </label>
          <input
            id="site-search"
            type="search"
            name="q"
            placeholder="Search articles…"
            autoComplete="off"
            className="w-40 rounded-l-lg border border-ink/20 bg-white px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft/70 focus:border-brand-600 focus:outline-none sm:w-48"
          />
          <button
            type="submit"
            className="rounded-r-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Search
          </button>
        </form>
      </div>
    </header>
  );
}
