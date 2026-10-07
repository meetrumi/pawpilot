// Shared text-analysis helpers for the Phase C agent pipeline.
// Pure functions, no I/O: trigram similarity (dedup/originality), readability,
// word/sentence counting, keyword density.

/** Strip HTML tags and decode the most common entities to plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
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

/** Split plain text into words (letters/digits/apostrophes). */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** Count words in HTML or plain text. */
export function countWords(htmlOrText: string): number {
  const looksLikeHtml = /<\w[^>]*>/.test(htmlOrText);
  return wordsOf(looksLikeHtml ? stripHtml(htmlOrText) : htmlOrText).length;
}

/** Split plain text into sentences. */
export function sentencesOf(text: string): string[] {
  const plain = stripHtml(text);
  return plain
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]e|ed|es)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words).
 * Higher = easier. PawPilot targets 60-70; QA fails below 50.
 */
export function fleschReadingEase(htmlOrText: string): number {
  const looksLikeHtml = /<\w[^>]*>/.test(htmlOrText);
  const text = looksLikeHtml ? stripHtml(htmlOrText) : htmlOrText;
  const words = wordsOf(text);
  const sentences = sentencesOf(text);
  if (words.length === 0 || sentences.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
}

/** Character trigrams of a normalized string. */
export function trigrams(s: string): Set<string> {
  const norm = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const set = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i++) {
    set.add(norm.slice(i, i + 3));
  }
  return set;
}

/** Jaccard similarity of trigram sets, 0..1. */
export function trigramJaccard(a: string, b: string): number {
  const sa = trigrams(a);
  const sb = trigrams(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Token set of significant words (len > 2, stopwords removed). */
const STOPWORDS = new Set(
  'the,a,an,and,or,but,to,of,in,on,for,with,at,by,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,you,your,we,our,they,their,he,she,his,her,what,when,where,which,who,how,why,can,should,will,would,do,does,did,not,no,yes,if,then,than,so,such,into,about,over,after,before,between,up,out,off,all,any,each,more,most,other,some,only,own,same,too,very,just,also,dog,dogs,cat,cats,pet,pets'.split(
    ',',
  ),
);

export function significantTokens(s: string): Set<string> {
  const set = new Set<string>();
  for (const w of wordsOf(s)) {
    if (w.length > 2 && !STOPWORDS.has(w)) set.add(w);
  }
  return set;
}

/**
 * Token overlap between two phrases: |A∩B| / min(|A|,|B|), 0..1.
 * Used for keyword-overlap dedup and internal-link relevance.
 */
export function tokenOverlap(a: string, b: string): number {
  const sa = significantTokens(a);
  const sb = significantTokens(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

/**
 * Keyword density: occurrences of the exact keyword phrase per 100 words.
 * Returns a percentage (e.g. 1.2 = 1.2%).
 */
export function keywordDensity(htmlOrText: string, keyword: string): number {
  const looksLikeHtml = /<\w[^>]*>/.test(htmlOrText);
  const text = (looksLikeHtml ? stripHtml(htmlOrText) : htmlOrText).toLowerCase();
  const words = wordsOf(text);
  if (words.length === 0) return 0;
  const kw = keyword.toLowerCase().trim();
  if (!kw) return 0;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = text.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? [];
  return (hits.length / words.length) * 100;
}

/** First-100-words slice of an article, for keyword-presence checks. */
export function firstWords(htmlOrText: string, n: number): string {
  const looksLikeHtml = /<\w[^>]*>/.test(htmlOrText);
  const text = looksLikeHtml ? stripHtml(htmlOrText) : htmlOrText;
  return text.split(/\s+/).slice(0, n).join(' ');
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
