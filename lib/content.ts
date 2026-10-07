// Content processing for article HTML: TOC extraction (H2/H3 -> ids),
// secondary-image placement after a configured heading, FAQ and
// key-takeaway parsing. Operates on the agent-generated contentHtml
// (already sanitized at write time). No dependencies, no I/O.

import { slugify } from './format';

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface TocResult {
  /** HTML with unique ids injected into every H2/H3. */
  html: string;
  toc: TocEntry[];
}

/** Plain text of an HTML fragment (strip tags, decode common entities). */
export function htmlToText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADING_RE = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const H1_RE = /<h1(\s[^>]*)?>([\s\S]*?)<\/h1>/gi;

/**
 * Demote content H1s to H2. The post page template renders the post title as
 * the page's single H1, so any H1 inside the article HTML would create a
 * duplicate-H1 page (bad for SEO). Demoting preserves the content and keeps
 * exactly one H1 per page.
 */
export function demoteContentH1(html: string): string {
  return html.replace(
    H1_RE,
    (_match, attrs: string | undefined, inner: string) => `<h2${attrs ?? ''}>${inner}</h2>`,
  );
}

/**
 * Extract H2/H3 headings into a TOC and inject unique `id` attributes.
 * Existing ids are preserved; duplicates get numeric suffixes.
 */
export function extractToc(html: string): TocResult {
  const used = new Set<string>();
  const toc: TocEntry[] = [];

  // The page template renders the title as the single H1; demote any
  // content H1s first so the page never has duplicate H1s.
  const out = demoteContentH1(html).replace(
    HEADING_RE,
    (match, levelStr: string, attrs: string | undefined, inner: string) => {
      const level = Number(levelStr) as 2 | 3;
      const text = htmlToText(inner);
      if (!text) return match;

      const existingId = attrs?.match(/\sid=["']([^"']+)["']/i)?.[1];
      let id = existingId ?? slugify(text) ?? 'section';
      if (!existingId) {
        let candidate = id;
        let n = 2;
        while (used.has(candidate)) {
          candidate = `${id}-${n}`;
          n += 1;
        }
        id = candidate;
      }
      used.add(id);
      toc.push({ id, text, level });

      if (existingId) return match;
      const attrStr = attrs ?? '';
      return `<h${level}${attrStr} id="${id}">${inner}</h${level}>`;
    },
  );

  return { html: out, toc };
}

/** Escape for safe interpolation into HTML attribute values. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Insert a <figure> with the secondary image right after the heading whose
 * text matches `afterHeading` (case-insensitive, punctuation-tolerant).
 * Returns the HTML unchanged when there is no match or no image.
 */
export function insertSecondaryImage(
  html: string,
  imageUrl: string | null | undefined,
  imageAlt: string | null | undefined,
  afterHeading: string | null | undefined,
): string {
  if (!imageUrl || !afterHeading) return html;
  const target = afterHeading.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!target) return html;

  const figure =
    `<figure class="article-figure"><img src="${escapeAttr(imageUrl)}" ` +
    `alt="${escapeAttr(imageAlt || 'Illustration')}" loading="lazy" />` +
    (imageAlt ? `<figcaption>${escapeAttr(imageAlt)}</figcaption>` : '') +
    `</figure>`;

  let inserted = false;
  const out = html.replace(
    HEADING_RE,
    (match, _level: string, _attrs: string | undefined, inner: string) => {
      if (inserted) return match;
      const text = htmlToText(inner).toLowerCase();
      if (text === target || text.startsWith(`${target} `) || text.startsWith(`${target}:`)) {
        inserted = true;
        return `${match}\n${figure}`;
      }
      return match;
    },
  );
  return out;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** Parse the faqJson column (JSON [{q,a}]); [] on any problem. */
export function parseFaqJson(raw: string | null | undefined): FaqItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is { q: unknown; a: unknown } =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as { q: unknown }).q === 'string' &&
          typeof (e as { a: unknown }).a === 'string',
      )
      .map((e) => ({ q: (e.q as string).trim(), a: (e.a as string).trim() }))
      .filter((e) => e.q.length > 0 && e.a.length > 0);
  } catch {
    return [];
  }
}

/** Parse the keyTakeaways column (JSON [strings]); [] on any problem. */
export function parseTakeaways(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Split article HTML into two halves for the mid-article ad slot.
 * Prefers cutting right after the middle H2; falls back to the paragraph
 * nearest 40% of the way through. Returns [html, ''] when no sensible
 * split point exists (caller then skips the mid-article slot).
 */
export function splitForMidAd(html: string): [string, string] {
  const h2Closes: number[] = [];
  const h2Re = /<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(html)) !== null) {
    h2Closes.push(m.index + m[0].length);
  }
  if (h2Closes.length >= 2) {
    const cut = h2Closes[Math.floor(h2Closes.length / 2)];
    return [html.slice(0, cut), html.slice(cut)];
  }
  const pCloses: number[] = [];
  const pRe = /<\/p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(html)) !== null) {
    pCloses.push(pm.index + pm[0].length);
  }
  if (pCloses.length >= 3) {
    const cut = pCloses[Math.floor(pCloses.length * 0.4)];
    return [html.slice(0, cut), html.slice(cut)];
  }
  return [html, ''];
}
