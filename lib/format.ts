/** Estimated reading time in whole minutes (min 1), at ~200 wpm. */
export function readingTimeMinutes(wordCount: number): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/** Locale-formatted date, e.g. "October 7, 2026", rendered in the given IANA timezone. */
export function formatDate(date: Date | string | number, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

/** URL-safe slug: lowercase, accents stripped, runs of non-alphanumerics -> single dash. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
