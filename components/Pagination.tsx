import Link from 'next/link';

/** Numbered pagination for category archives. */
export function Pagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`);
  const pages: number[] = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) pages.push(p);
  }
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand-600 hover:text-brand-700"
        >
          ← Newer
        </Link>
      )}
      <ul className="flex items-center gap-1">
        {pages.map((p, i) => (
          <li key={p}>
            {i > 0 && pages[i - 1] !== p - 1 && (
              <span aria-hidden="true" className="px-1 text-ink-soft">
                …
              </span>
            )}
            {p === page ? (
              <span
                aria-current="page"
                className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-bold text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                href={href(p)}
                className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-brand-600 hover:text-brand-700"
              >
                {p}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {page < totalPages && (
        <Link
          href={href(page + 1)}
          rel="next"
          className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand-600 hover:text-brand-700"
        >
          Older →
        </Link>
      )}
    </nav>
  );
}
