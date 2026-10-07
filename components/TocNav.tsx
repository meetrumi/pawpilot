import type { TocEntry } from '@/lib/content';

/** Sticky auto table-of-contents built from the article's H2/H3 headings. */
export function TocNav({ toc }: { toc: TocEntry[] }) {
  if (toc.length === 0) return null;
  return (
    <nav
      aria-label="Table of contents"
      className="rounded-2xl border border-ink/10 bg-white p-5 lg:sticky lg:top-6"
    >
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
        On this page
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {toc.map((entry) => (
          <li key={entry.id} className={entry.level === 3 ? 'ml-4' : ''}>
            <a
              href={`#${entry.id}`}
              className="rounded text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
