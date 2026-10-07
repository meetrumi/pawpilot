// SERP analysis for the PawPilot agent pipeline.
//
// Queries DuckDuckGo's HTML endpoint for the target keyword, takes the top 5
// result URLs, fetches each page (10s timeout, UA header), and extracts
// H1/H2/H3 headings plus question-like headings via regex. From those it
// derives: the questions readers ask, content gaps (questions none of the
// competitors answer well, missing examples/data), and a stronger outline.
//
// NEVER copies competitor sentences: only headings/topics and short snippets
// (<=200 chars, used for the QA originality check) are retained.

import { tokenOverlap } from './text';

export interface SerpAnalysis {
  outline: string[];
  questions: string[];
  gaps: string[];
  competitorSnippets: string[];
}

const UA = 'PawPilotBot/1.0 (+https://pawpilot.com) research';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 5;

function log(step: string, detail: string): void {
  console.log(`[serp] ${step}: ${detail}`);
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract result URLs from DuckDuckGo's HTML results page. */
function extractResultUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  // Primary: /l/?uddg=<encoded target>&rut=...
  for (const m of html.matchAll(/[?&]uddg=([^&"']+)/g)) {
    try {
      const target = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(target) && !seen.has(target)) {
        seen.add(target);
        urls.push(target);
      }
    } catch {
      // skip malformed encodings
    }
    if (urls.length >= MAX_RESULTS) break;
  }
  // Fallback: direct result anchors.
  if (urls.length === 0) {
    for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"/gi)) {
      let href = m[1];
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try {
          href = decodeURIComponent(uddg[1]);
        } catch {
          continue;
        }
      }
      if (/^https?:\/\//i.test(href) && !seen.has(href)) {
        seen.add(href);
        urls.push(href);
      }
      if (urls.length >= MAX_RESULTS) break;
    }
  }
  return urls.slice(0, MAX_RESULTS);
}

interface PageHeadings {
  url: string;
  h1: string[];
  h2: string[];
  h3: string[];
  snippet: string;
}

function extractHeadings(html: string, url: string): PageHeadings {
  const pick = (level: number): string[] => {
    const out: string[] = [];
    const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
    for (const m of html.matchAll(re)) {
      const text = stripTags(m[1]);
      if (text.length >= 3 && text.length <= 200 && !out.includes(text)) out.push(text);
    }
    return out;
  };
  // Snippet: meta description, else the first substantial paragraph.
  let snippet =
    html.match(/<meta[^>]*name="description"[^>]*content="([^"]{20,300})"/i)?.[1] ??
    html.match(/<meta[^>]*content="([^"]{20,300})"[^>]*name="description"/i)?.[1] ??
    '';
  if (!snippet) {
    for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const text = stripTags(m[1]);
      if (text.length >= 60) {
        snippet = text.slice(0, 200);
        break;
      }
    }
  }
  return { url, h1: pick(1), h2: pick(2), h3: pick(3), snippet: stripTags(snippet).slice(0, 200) };
}

async function fetchPage(url: string): Promise<PageHeadings | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      log('warn', `fetch ${url}: HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) {
      log('warn', `fetch ${url}: non-HTML (${contentType})`);
      return null;
    }
    const html = await res.text();
    const headings = extractHeadings(html, url);
    log(
      'fetch-ok',
      `${url} -> H1:${headings.h1.length} H2:${headings.h2.length} H3:${headings.h3.length}`,
    );
    return headings;
  } catch (err) {
    log('warn', `fetch ${url} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

const QUESTION_START = /^(who|what|where|when|why|how|which|can|should|is|are|do|does|will|would)\b/i;

function isQuestion(heading: string): boolean {
  return heading.trim().endsWith('?') || QUESTION_START.test(heading.trim());
}

/** Dedup headings across pages by token overlap. */
function dedupeHeadings(headings: string[]): string[] {
  const kept: string[] = [];
  for (const h of headings) {
    if (!kept.some((k) => tokenOverlap(k, h) > 0.7)) kept.push(h);
  }
  return kept;
}

/** Extract result URLs from Bing's RSS search output (skip self-links). */
function extractBingRssUrls(xml: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<link>([^<]+)<\/link>/gi)) {
    const url = m[1].trim();
    if (!/^https?:\/\//i.test(url) || /bing\.com/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_RESULTS) break;
  }
  return urls;
}

async function fetchBingRss(keyword: string): Promise<string[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(keyword)}&format=rss`;
  log('fetch', 'Bing RSS (DuckDuckGo fallback)');
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Bing RSS query failed: HTTP ${res.status}`);
  return extractBingRssUrls(await res.text());
}

/**
 * Analyze the SERP for a keyword: outline topics, reader questions,
 * content gaps, and short competitor snippets (for originality checks).
 * Tries DuckDuckGo's HTML endpoint first (per spec), then falls back to
 * Bing RSS when DDG is blocked or returns nothing.
 */
export async function analyzeSerp(keyword: string): Promise<SerpAnalysis> {
  log('start', `keyword="${keyword}"`);
  let urls: string[] = [];
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!ddgRes.ok) throw new Error(`DuckDuckGo query failed: HTTP ${ddgRes.status}`);
    urls = extractResultUrls(await ddgRes.text());
    log('results', `DuckDuckGo: ${urls.length} result URLs`);
  } catch (err) {
    log('warn', `DuckDuckGo failed (${err instanceof Error ? err.message : err}); trying Bing RSS`);
  }
  if (urls.length === 0) {
    urls = await fetchBingRss(keyword);
    log('results', `Bing RSS: ${urls.length} result URLs`);
  }

  // Dictionary/thesaurus domains never carry pet-care content; drop them early.
  const DICTIONARY_DOMAIN = /(merriam-webster|dictionary\.cambridge|dictionary\.com|thesaurus\.com|thefreedictionary|collinsdictionary|vocabulary\.com)/i;
  const NICHE_TERM = /(dog|cat|puppy|kitten|pup|kitty|pet)/i;

  const pages: PageHeadings[] = [];
  for (const url of urls) {
    if (DICTIONARY_DOMAIN.test(url)) {
      log('skip', `${url} (dictionary domain)`);
      continue;
    }
    const page = await fetchPage(url);
    if (!page) continue;
    const headingsText = [...page.h1, ...page.h2, ...page.h3].join(' ');
    if (!NICHE_TERM.test(headingsText)) {
      log('skip', `${url} (no pet terms in headings — off-topic result)`);
      continue;
    }
    pages.push(page);
  }
  if (pages.length === 0) {
    // No usable competitor pages (blocked SERP, dictionary-only results, …).
    // Return an empty analysis and let the writer build its own outline —
    // honest degradation instead of copying irrelevant headings.
    log('warn', 'no relevant competitor pages; returning empty analysis');
    return { outline: [], questions: [], gaps: [], competitorSnippets: [] };
  }

  const allH2 = dedupeHeadings(pages.flatMap((p) => p.h2));
  const allH3 = dedupeHeadings(pages.flatMap((p) => p.h3));
  const questions = dedupeHeadings(
    pages.flatMap((p) => [...p.h1, ...p.h2, ...p.h3]).filter(isQuestion),
  );
  log('extract', `${allH2.length} H2s, ${allH3.length} H3s, ${questions.length} questions`);

  // Gaps: questions that no non-question heading addresses (token overlap < 0.4
  // with every topical heading), i.e. asked but not answered by competitors.
  const topical = [...allH2, ...allH3].filter((h) => !isQuestion(h));
  const gaps: string[] = [];
  for (const q of questions) {
    const addressed = topical.some((t) => tokenOverlap(q, t) >= 0.4);
    if (!addressed) gaps.push(q);
  }
  // Structural gaps: competitors rarely give concrete numbers/examples.
  const hasDataHeading = topical.some((h) => /(example|mistake|step|number|statistic|data|case)/i.test(h));
  if (!hasDataHeading) {
    gaps.push('Concrete, specific examples with numbers (competitors stay vague and generic)');
  }
  log('gaps', `${gaps.length} content gaps identified`);

  // Better outline: frequent/unique H2 topics first, then gap-driven sections.
  const freq = new Map<string, number>();
  for (const h of allH2) freq.set(h, (freq.get(h) ?? 0) + 1);
  const outline = [...allH2].sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)).slice(0, 8);
  for (const gap of gaps.slice(0, 3)) {
    const asSection = gap.replace(/\?$/, '');
    if (!outline.some((o) => tokenOverlap(o, asSection) > 0.6)) outline.push(asSection);
  }

  const competitorSnippets = pages.map((p) => p.snippet).filter((s) => s.length > 0).slice(0, 5);

  log('done', `outline=${outline.length}, questions=${questions.length}, gaps=${gaps.length}`);
  return {
    outline,
    questions: questions.slice(0, 10),
    gaps: gaps.slice(0, 6),
    competitorSnippets,
  };
}
