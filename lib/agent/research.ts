// Topic research for the PawPilot agent pipeline.
//
// Real sources, no keys required:
//   - Google Trends daily RSS (US)            -> trending searches
//   - Reddit hot.json (r/dogs, r/cats, r/pets, r/puppy101) -> real owner questions
//   - HN Algolia search API                   -> pet-related stories/discussions
//   - Google News RSS (pet topics, last 7d)   -> news-jacking candidates
//   - YouTube autocomplete                    -> evergreen query demand
//   - Wikipedia pageviews                     -> validates animal-level interest momentum
//
// Scoring heuristic (each 0-100, total weighted):
//   trendMomentum (25%): source signal strength. Trends rank (100 - rank*4);
//     News recency decay 100*exp(-ageHrs/48); Reddit min(100, 20 + score/10 +
//     comments/2); HN min(100, points*2); YouTube baseline 35.
//   intent (20%): commercial-investigation patterns (best/review/vs/compare)
//     85-95; question patterns (how/why/what/guide/tips) 70-80; else 50-60.
//   competitionEstimate (20%, higher = EASIER to rank): word count >= 6 -> 90,
//     5 -> 80, 4 -> 65, 3 -> 45, <= 2 -> 25; question format +10 (cap 100).
//     Long-tail questions are where a new domain can win.
//   relevance (20%): pet-term match density, 60 + 10 per distinct pet term
//     (cap 100). Off-niche candidates are rejected before scoring.
//   evergreen (15%): source baseline (reddit 80, youtube 85, hn 40, trends 20,
//     news 15) + 15 for timeless patterns (how to/why does/guide).
//   total = round(0.25*trend + 0.20*intent + 0.20*competition + 0.20*relevance
//           + 0.15*evergreen), plus up to +10 Wikipedia momentum boost.
//
// Dedup: candidates are rejected when trigram Jaccard similarity vs any
// existing post title/slug or queued topic keyword exceeds 0.5, or when
// keyword token overlap exceeds 0.6 (keyword cannibalization guard).
// Output: ~1 trending + ~2 evergreen candidates inserted into TopicQueue
// with status "pending". Every fetch/parsing step is logged.

import { db } from '../db';
import { trigramJaccard, tokenOverlap, significantTokens } from './text';

export interface TopicScores {
  trendMomentum: number;
  intent: number;
  competitionEstimate: number;
  relevance: number;
  evergreen: number;
  total: number;
}

export interface TopicCandidate {
  keyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  categorySlug: string;
  rationale: string;
  scores: TopicScores;
  source: string;
  trending: boolean;
}

const UA = 'PawPilotBot/1.0 (+https://pawpilot.com) research';
const FETCH_TIMEOUT_MS = 15_000;

function log(step: string, detail: string): void {
  console.log(`[research] ${step}: ${detail}`);
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<unknown>;
}

// ------------------------------------------------------------ raw signals ---
interface RawSignal {
  phrase: string;
  source: string;
  strength: number; // 0..100 pre-normalized momentum signal
  meta?: string;
}

function rssItemTitles(xml: string): Array<{ title: string; pubDate?: string }> {
  const items: Array<{ title: string; pubDate?: string }> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title = m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    const pubDate = m[1].match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim();
    if (title) items.push({ title: decodeEntities(title), pubDate });
  }
  return items;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[|\]\]>/g, '');
}

async function fetchGoogleTrends(): Promise<RawSignal[]> {
  log('fetch', 'Google Trends daily RSS (geo=US)');
  const xml = await fetchText('https://trends.google.com/trending/rss?geo=US');
  const items = rssItemTitles(xml);
  log('parse', `Google Trends: ${items.length} trending searches`);
  return items.slice(0, 20).map((item, i) => ({
    phrase: item.title,
    source: 'google-trends',
    strength: Math.max(5, 100 - i * 4),
  }));
}

interface RedditPost {
  title: string;
  score: number;
  comments: number;
}

async function fetchRedditDirect(sub: string): Promise<RedditPost[]> {
  const data = (await fetchJson(`https://www.reddit.com/r/${sub}/hot.json?limit=25`)) as {
    data?: { children?: Array<{ data?: { title?: string; score?: number; num_comments?: number } }> };
  };
  return (data.data?.children ?? []).flatMap((c) => {
    const d = c.data;
    if (!d?.title) return [];
    return [{ title: d.title, score: d.score ?? 0, comments: d.num_comments ?? 0 }];
  });
}

/**
 * Arctic Shift (arctic-shift.photon-reddit.com) is a real Reddit archive API.
 * Used as a fallback when reddit.com blocks datacenter IPs (HTTP 403).
 */
async function fetchRedditArchive(sub: string): Promise<RedditPost[]> {
  const url =
    `https://arctic-shift.photon-reddit.com/api/posts/search` +
    `?subreddit=${encodeURIComponent(sub)}&limit=25&sort=desc&sort_type=created_utc`;
  const data = (await fetchJson(url)) as {
    data?: Array<{ title?: string; score?: number; num_comments?: number }>;
  };
  return (data.data ?? []).flatMap((p) => {
    if (!p?.title) return [];
    return [{ title: p.title, score: p.score ?? 0, comments: p.num_comments ?? 0 }];
  });
}

async function fetchReddit(sub: string): Promise<RawSignal[]> {
  log('fetch', `Reddit r/${sub} hot.json`);
  let posts: RedditPost[];
  try {
    posts = await fetchRedditDirect(sub);
  } catch (err) {
    log('warn', `reddit.com blocked (${err instanceof Error ? err.message : err}); trying Arctic Shift archive`);
    posts = await fetchRedditArchive(sub);
  }
  log('parse', `Reddit r/${sub}: ${posts.length} posts`);
  return posts.map((p) => ({
    phrase: p.title,
    source: `reddit:${sub}`,
    strength: Math.min(100, 20 + p.score / 10 + p.comments / 2),
    meta: `${p.score} upvotes, ${p.comments} comments`,
  }));
}

async function fetchHn(): Promise<RawSignal[]> {
  log('fetch', 'HN Algolia search (dog cat pet, story tag)');
  const data = (await fetchJson(
    'http://hn.algolia.com/api/v1/search?query=dog%20cat%20pet&tags=story',
  )) as {
    hits?: Array<{ title?: string; points?: number }>;
  };
  const hits = data.hits ?? [];
  log('parse', `HN Algolia: ${hits.length} hits`);
  return hits.slice(0, 15).flatMap((h) => {
    if (!h.title) return [];
    return [{ phrase: h.title, source: 'hn-algolia', strength: Math.min(100, (h.points ?? 0) * 2) }];
  });
}

async function fetchGoogleNews(): Promise<RawSignal[]> {
  log('fetch', 'Google News RSS (pet topics, last 7 days)');
  const q = encodeURIComponent('dog OR cat pet care');
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${q}+when:7d&hl=en-US&gl=US&ceid=US:en`,
  );
  const items = rssItemTitles(xml);
  log('parse', `Google News: ${items.length} articles`);
  const now = Date.now();
  return items.slice(0, 20).map((item) => {
    const ageHrs = item.pubDate ? Math.max(0, (now - Date.parse(item.pubDate)) / 3_600_000) : 72;
    // News titles end with " - Source"; strip it for a cleaner phrase.
    const phrase = item.title.replace(/\s+-\s+[^-]+$/, '').trim();
    return {
      phrase,
      source: 'google-news',
      strength: Math.round(100 * Math.exp(-ageHrs / 48)),
      meta: item.pubDate,
    };
  });
}

const YT_SEEDS = ['dog training', 'cat care', 'puppy training', 'cat behavior', 'dog health'];

async function fetchYouTubeSuggest(query: string): Promise<string[]> {
  // client=firefox returns pure JSON for the YouTube dataset; client=youtube
  // wraps it in a JSONP callback, which we unwrap as a fallback.
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
  const text = await fetchText(url);
  const parse = (raw: string): string[] => {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
      return (parsed[1] as unknown[]).filter((s): s is string => typeof s === 'string');
    }
    return [];
  };
  try {
    return parse(text);
  } catch {
    const jsonp = text.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
    if (jsonp) {
      try {
        return parse(jsonp[1]);
      } catch {
        // fall through
      }
    }
  }
  return [];
}

async function fetchYouTubeSuggests(): Promise<RawSignal[]> {
  log('fetch', `YouTube autocomplete for ${YT_SEEDS.length} seed queries`);
  const signals: RawSignal[] = [];
  for (const seed of YT_SEEDS) {
    try {
      const suggestions = await fetchYouTubeSuggest(seed);
      log('parse', `YouTube suggest "${seed}": ${suggestions.length} suggestions`);
      for (const s of suggestions.slice(0, 8)) {
        signals.push({ phrase: s, source: 'youtube-suggest', strength: 35 });
      }
    } catch (err) {
      log('warn', `YouTube suggest "${seed}" failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return signals;
}

/**
 * Wikipedia pageviews: compare the last 7 days vs the previous 7 days for
 * core pet articles. Rising animal-level interest boosts trendMomentum of
 * matching candidates. Returns boost per animal keyword.
 */
async function fetchWikipediaMomentum(): Promise<Record<string, number>> {
  const boosts: Record<string, number> = {};
  const articles = ['Dog', 'Cat', 'Puppy', 'Kitten'];
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const end = new Date(today.getTime() - 2 * 86400000); // 2-day data lag
  const mid = new Date(end.getTime() - 7 * 86400000);
  const start = new Date(mid.getTime() - 7 * 86400000);
  log('fetch', 'Wikipedia pageviews (Dog/Cat/Puppy/Kitten, 7d vs prior 7d)');
  for (const article of articles) {
    try {
      const url =
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/` +
        `all-access/user/${article}/daily/${fmt(start)}/${fmt(end)}`;
      const data = (await fetchJson(url)) as { items?: Array<{ views?: number; timestamp?: string }> };
      const items = data.items ?? [];
      const midTs = fmt(mid) + '00';
      const recent = items.filter((i) => (i.timestamp ?? '') >= midTs).reduce((s, i) => s + (i.views ?? 0), 0);
      const prior = items.filter((i) => (i.timestamp ?? '') < midTs).reduce((s, i) => s + (i.views ?? 0), 0);
      if (prior > 0) {
        const growth = (recent - prior) / prior;
        const boost = growth > 0.2 ? 10 : growth > 0.1 ? 5 : 0;
        if (boost > 0) {
          boosts[article.toLowerCase()] = boost;
          log('signal', `Wikipedia ${article}: +${Math.round(growth * 100)}% views -> +${boost} momentum boost`);
        }
      }
    } catch (err) {
      log('warn', `Wikipedia pageviews for ${article} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return boosts;
}

// ------------------------------------------------------------- niche filter ---
const ANIMAL_TERM = /(dog|dogs|puppy|puppies|pup|canine|cat|cats|kitten|kittens|kitty|feline|pet|pets)/i;

// Pet-care intent/care vocabulary: a phrase must contain one of these in
// addition to an animal term, otherwise it is usually an opinion piece,
// metaphor, or news item ("cat boom gives startups...") rather than a
// question PawPilot can answer.
const CARE_TERM =
  /(how|why|what|when|where|which|best|guide|tip|train|care|health|behav|feed|groom|vet|review|compar|food|toy|bed|leash|litter|bark|bit|anxiet|vaccin|walk|sleep|eat|play|potty|crate|scratch|shed|adopt|rescue|breed|puppy|kitten|senior|bath|nail|teeth|dental|flea|tick|worm|spay|neuter|insur|travel|hik|park|stop)/i;

// Obvious off-niche contexts even when a pet word appears.
const OFF_NICHE = /(startup|venture|github|code|coding|variable|algorithm|stock|market|iphone|android|crypto|bitcoin|election|senator|congress)/i;

function cleanPhrase(phrase: string): string {
  return phrase
    // strip editorial prefixes like "Opinion | ..." and tag brackets "[Help] ..."
    .replace(/^(opinion|news|video|watch|live|breaking|analysis)\s*\|\s*/i, '')
    .replace(/^\[[^\]]{1,20}\]\s*/i, '')
    // strip parenthetical asides ("... (in the best possible way)")
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reject off-niche phrases and junk (too short/long, metaphorical pet mentions). */
function isOnNiche(phrase: string): boolean {
  const words = phrase.split(/\s+/).length;
  if (words < 3 || words > 14) return false;
  if (OFF_NICHE.test(phrase)) return false;
  // Year-dated headlines are news items, not answerable evergreen queries.
  if (/\b(19|20)\d{2}\b/.test(phrase)) return false;
  return ANIMAL_TERM.test(phrase) && CARE_TERM.test(phrase);
}

// --------------------------------------------------------------- categorize ---
const CATEGORY_RULES: Array<{ slug: string; test: RegExp }> = [
  { slug: 'pet-health', test: /(vet|vaccine|vaccination|dental|teeth|sick|illness|symptom|disease|diet|nutrition|health|parasite|flea|tick|spay|neuter)/i },
  { slug: 'product-reviews', test: /(best|review|vs\.?|versus|compare|top \d|toy|food|bed|collar|leash|carrier|treat)/i },
  { slug: 'breed-guides', test: /(breed|labrador|golden retriever|poodle|bulldog|beagle|husky|shepherd|persian|siamese|maine coon|ragdoll)/i },
  { slug: 'adventures', test: /(travel|hike|hiking|park|road trip|beach|camping|adventure)/i },
  { slug: 'dog-training', test: /(train|barking|biting|behavior|behaviour|anxiety|leash|crate|potty|aggressive|obedience|puppy)/i },
  { slug: 'cat-care', test: /(cat|kitten|feline|litter|scratching|indoor)/i },
];

function assignCategory(keyword: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(keyword)) return rule.slug;
  }
  return 'dog-training';
}

function detectIntent(keyword: string): string {
  if (/(best|review|vs\.?|versus|compare|top \d|which|worth it)/i.test(keyword)) return 'commercial';
  return 'informational';
}

// ------------------------------------------------------------------ scoring ---
function scoreIntent(keyword: string, searchIntent: string): number {
  if (searchIntent === 'commercial') return /(best|review)/i.test(keyword) ? 92 : 85;
  if (/^(how|why|what|when|where|can|should|is|are|do|does)/i.test(keyword)) return 78;
  if (/(guide|tips|steps)/i.test(keyword)) return 74;
  return 55;
}

function scoreCompetition(keyword: string): number {
  const n = keyword.split(/\s+/).length;
  let score = n >= 6 ? 90 : n === 5 ? 80 : n === 4 ? 65 : n === 3 ? 45 : 25;
  if (/^(how|why|what|when|where|can|should)/i.test(keyword)) score = Math.min(100, score + 10);
  return score;
}

function scoreRelevance(keyword: string): number {
  const terms = keyword.toLowerCase().match(/dog|dogs|puppy|puppies|canine|cat|cats|kitten|kittens|feline|pet|pets|breed|vet/g) ?? [];
  return Math.min(100, 60 + new Set(terms).size * 10);
}

function scoreEvergreen(keyword: string, source: string): number {
  const base = source.startsWith('reddit') ? 80
    : source === 'youtube-suggest' ? 85
    : source === 'hn-algolia' ? 40
    : source === 'google-trends' ? 20
    : 15; // google-news
  const timeless = /(how to|why does|why do|guide|tips|care|training)/i.test(keyword) ? 15 : 0;
  return Math.min(100, base + timeless);
}

function buildScores(signal: RawSignal, keyword: string, wikiBoosts: Record<string, number>): TopicScores {
  const searchIntent = detectIntent(keyword);
  let trendMomentum = Math.round(signal.strength);
  const lower = keyword.toLowerCase();
  for (const [animal, boost] of Object.entries(wikiBoosts)) {
    if (lower.includes(animal)) trendMomentum = Math.min(100, trendMomentum + boost);
  }
  const intent = scoreIntent(keyword, searchIntent);
  const competitionEstimate = scoreCompetition(keyword);
  const relevance = scoreRelevance(keyword);
  const evergreen = scoreEvergreen(keyword, signal.source);
  const total = Math.round(
    0.25 * trendMomentum + 0.2 * intent + 0.2 * competitionEstimate + 0.2 * relevance + 0.15 * evergreen,
  );
  return { trendMomentum, intent, competitionEstimate, relevance, evergreen, total };
}

// -------------------------------------------------------------------- dedup ---
interface ExistingDoc {
  text: string;
}

async function loadExistingDocs(): Promise<ExistingDoc[]> {
  const [posts, queued] = await Promise.all([
    db.post.findMany({ select: { title: true, slug: true } }),
    db.topicQueue.findMany({
      where: { status: { in: ['pending', 'approved', 'used'] } },
      select: { keyword: true },
    }),
  ]);
  return [
    ...posts.map((p) => ({ text: `${p.title} ${p.slug.replace(/-/g, ' ')}` })),
    ...queued.map((q) => ({ text: q.keyword })),
  ];
}

/** True when the candidate is too similar to something already covered. */
function isDuplicate(keyword: string, existing: ExistingDoc[]): ExistingDoc | null {
  for (const doc of existing) {
    if (trigramJaccard(keyword, doc.text) > 0.5) return doc;
    if (tokenOverlap(keyword, doc.text) > 0.6) return doc;
  }
  return null;
}

// ------------------------------------------------------------------ research ---
/**
 * Run topic research: fetch all sources, extract pet-niche keyword
 * candidates, score them, dedupe against existing content, and insert the
 * top ~1 trending + ~2 evergreen candidates into TopicQueue (pending).
 */
export async function researchTopics(runId: string): Promise<TopicCandidate[]> {
  log('start', `runId=${runId}`);
  const signals: RawSignal[] = [];

  const collectors: Array<() => Promise<RawSignal[]>> = [
    fetchGoogleTrends,
    () => fetchReddit('dogs'),
    () => fetchReddit('cats'),
    () => fetchReddit('pets'),
    () => fetchReddit('puppy101'),
    fetchHn,
    fetchGoogleNews,
    fetchYouTubeSuggests,
  ];
  for (const collect of collectors) {
    try {
      const batch = await collect();
      signals.push(...batch);
    } catch (err) {
      log('warn', `source failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  log('collect', `${signals.length} raw signals from all sources`);

  const wikiBoosts = await fetchWikipediaMomentum();

  // Filter to on-niche, dedupe within the batch (keep strongest signal).
  const byKeyword = new Map<string, RawSignal>();
  for (const signal of signals) {
    const keyword = cleanPhrase(signal.phrase);
    if (!isOnNiche(keyword)) continue;
    const key = keyword.toLowerCase();
    const prev = byKeyword.get(key);
    if (!prev || signal.strength > prev.strength) byKeyword.set(key, { ...signal, phrase: keyword });
  }
  log('filter', `${byKeyword.size} on-niche unique candidates`);

  const existing = await loadExistingDocs();
  log('dedup', `comparing against ${existing.length} existing posts/queued topics`);

  const candidates: TopicCandidate[] = [];
  for (const signal of byKeyword.values()) {
    const keyword = signal.phrase;
    const dup = isDuplicate(keyword, existing);
    if (dup) {
      log('dedup-skip', `"${keyword}" too similar to existing: "${dup.text.slice(0, 60)}"`);
      continue;
    }
    const scores = buildScores(signal, keyword, wikiBoosts);
    const trending = signal.source === 'google-trends' || signal.source === 'google-news' || scores.trendMomentum >= 70;
    candidates.push({
      keyword,
      secondaryKeywords: [],
      searchIntent: detectIntent(keyword),
      categorySlug: assignCategory(keyword),
      rationale: '',
      scores,
      source: signal.source,
      trending,
    });
  }
  log('score', `${candidates.length} candidates after dedup`);

  if (candidates.length === 0) {
    throw new Error('research: no viable candidates from any source');
  }

  // Secondary keywords: real YouTube suggestions for the top candidates.
  const topForSecondary = [...candidates].sort((a, b) => b.scores.total - a.scores.total).slice(0, 6);
  for (const candidate of topForSecondary) {
    try {
      const suggestions = await fetchYouTubeSuggest(candidate.keyword);
      candidate.secondaryKeywords = suggestions
        .filter((s) => s.toLowerCase() !== candidate.keyword.toLowerCase())
        .slice(0, 4);
      log('secondary', `"${candidate.keyword}": ${candidate.secondaryKeywords.length} secondary keywords`);
    } catch {
      // non-fatal; candidate keeps empty secondaryKeywords
    }
  }

  // Pick ~1 trending + ~2 evergreen by total score.
  const trendingPool = candidates.filter((c) => c.trending).sort((a, b) => b.scores.total - a.scores.total);
  const evergreenPool = candidates.filter((c) => !c.trending).sort((a, b) => b.scores.total - a.scores.total);
  const picked: TopicCandidate[] = [];
  if (trendingPool.length > 0) picked.push(trendingPool[0]);
  picked.push(...evergreenPool.slice(0, 2));
  // Backfill if a pool was empty.
  if (picked.length < 3) {
    const rest = candidates
      .filter((c) => !picked.includes(c))
      .sort((a, b) => b.scores.total - a.scores.total);
    picked.push(...rest.slice(0, 3 - picked.length));
  }

  const inserted: TopicCandidate[] = [];
  for (const candidate of picked) {
    candidate.rationale =
      `Surfaced by ${candidate.source}${candidate.trending ? ' (trending signal)' : ' (evergreen demand)'}. ` +
      `Scores: trend ${candidate.scores.trendMomentum}, intent ${candidate.scores.intent}, ` +
      `competition-ease ${candidate.scores.competitionEstimate}, relevance ${candidate.scores.relevance}, ` +
      `evergreen ${candidate.scores.evergreen} (total ${candidate.scores.total}). ` +
      `${candidate.searchIntent === 'commercial' ? 'Commercial-investigation intent with purchase upside. ' : 'Question-style query matching how owners actually search. '}` +
      `Long-tail (${candidate.keyword.split(/\s+/).length} words) suited to a new domain.`;
    const category = await db.category.findUnique({ where: { slug: candidate.categorySlug } });
    await db.topicQueue.create({
      data: {
        keyword: candidate.keyword,
        secondaryKeywords: candidate.secondaryKeywords,
        searchIntent: candidate.searchIntent,
        rationale: candidate.rationale,
        scoresJson: JSON.stringify(candidate.scores),
        status: 'pending',
        categoryId: category?.id ?? null,
        source: 'agent',
        runId,
      },
    });
    log('insert', `TopicQueue pending: "${candidate.keyword}" [${candidate.categorySlug}] total=${candidate.scores.total}`);
    inserted.push(candidate);
  }

  log('done', `inserted ${inserted.length} candidates`);
  return inserted;
}

/** Re-exported for tests: stopword-aware token helper. */
export { significantTokens };
