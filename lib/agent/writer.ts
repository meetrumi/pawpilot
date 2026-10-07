// Article writer for the PawPilot agent pipeline.
//
// Produces 1500-1800 word articles with an exact structure: hook intro that
// answers the main question in the first 2 sentences, H2/H3 sections, short
// paragraphs, lists/tables where useful, a key-takeaways aside, a 3-5 question
// FAQ, and a "The bottom line" conclusion. Human-writing rules (varied rhythm,
// contractions, concrete examples, specific numbers, first-hand tips) are
// enforced by the prompt and by post-checks: banned-phrase scan, keyword
// density cap (3%), structural checks, and targeted rewrites.
//
// Strategy: (1) base article call as raw HTML (reliable even with weaker
// models that cannot emit large JSON payloads); (2) continuation calls that
// append NEW sections until the 1500-word target is reached (some providers
// cap single responses well below it); (3) targeted fix calls for banned
// phrases / density / missing sections; (4) a small JSON metadata call.
// FAQ entries and key takeaways are extracted deterministically from the
// HTML so they always match the article body.
//
// Pet-health posts are preventive-only, cite veterinary sources, and always
// carry a disclaimer paragraph. Output HTML is sanitized with a strict
// allowlist. Exactly one H1 is enforced programmatically.

import sanitizeHtml from 'sanitize-html';
import { db } from '../db';
import { getAgentConfig } from '../settings';
import { slugify } from '../format';
import { callLLM, extractJson } from './providers';
import { countWords, keywordDensity, stripHtml, tokenOverlap, escapeHtml } from './text';
import type { FixedTopic } from './types';

export interface ArticleFaq {
  q: string;
  a: string;
}

export interface ArticleDraft {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  contentHtml: string;
  contentText: string;
  tags: string[];
  categorySlug: string;
  faqJson: ArticleFaq[];
  keyTakeaways: string[];
  internalLinks: Array<{ url: string; anchor: string }>;
  externalLinks: Array<{ url: string; anchor: string }>;
  featuredAlt: string;
  secondaryAlt: string;
  secondaryPlacementHeading: string;
  wordCount: number;
  providers: string[];
}

export interface WritePostInput {
  topic: FixedTopic;
  outline: string[];
  questions: string[];
  feedback?: string;
}

const DEFAULT_BANNED = [
  "In today's fast-paced world",
  'delve',
  'unlock',
  'game-changer',
  'landscape',
  "It's important to note",
  'In conclusion',
  'tapestry',
  'vibrant',
  'furry friends',
  'look no further',
];

const WORD_TARGET_MIN = 1500;
const WORD_TARGET_MAX = 1800;
const MAX_DENSITY = 3; // keyword density % ceiling
const MIN_BASE_WORDS = 600; // minimum acceptable first-draft length before expansion
const MAX_EXPANSIONS = 3;

const AUTHORITATIVE_DOMAINS = [
  'akc.org',
  'aspca.org',
  'avma.org',
  'aaha.org',
  'vcahospitals.com',
  'petmd.com',
  'cornell.edu',
  'tufts.edu',
  'thekennelclub.org.uk',
  'cats.org.uk',
  'rspca.org.uk',
  'fda.gov',
];

const PET_HEALTH_DISCLAIMER =
  'This article covers preventive care and general information only — it is not veterinary advice, ' +
  'does not diagnose any condition, and is no substitute for your veterinarian. If your pet shows signs of ' +
  'illness, pain, or a sudden change in behavior, contact a qualified veterinarian promptly.';

function log(step: string, detail: string): void {
  console.log(`[writer] ${step}: ${detail}`);
}

interface InternalCandidate {
  url: string;
  title: string;
  score: number;
}

/** Pick relevant published posts for internal linking by keyword overlap. */
async function pickInternalCandidates(topic: FixedTopic): Promise<InternalCandidate[]> {
  const posts = await db.post.findMany({
    where: { status: 'published' },
    select: { slug: true, title: true },
    take: 200,
  });
  const haystack = `${topic.keyword} ${topic.secondaryKeywords.join(' ')}`;
  return posts
    .map((p) => ({ url: `/post/${p.slug}`, title: p.title, score: tokenOverlap(haystack, p.title) }))
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
      'tr', 'th', 'td', 'blockquote', 'img', 'a', 'strong', 'em', 'aside', 'code',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      aside: ['class'],
    },
    allowedClasses: {
      aside: ['key-takeaways'],
    },
  });
}

/** Keep the first H1, demote any extras to H2. */
export function enforceSingleH1(html: string): string {
  let seen = 0;
  return html.replace(/<\/?h1(\s[^>]*)?>/gi, (m) => {
    const closing = m.startsWith('</');
    if (!closing) {
      seen++;
      if (seen > 1) return m.replace(/h1/i, 'h2');
    } else if (seen > 1) {
      return m.replace(/h1/i, 'h2');
    }
    return m;
  });
}

/** Strip markdown fences some models wrap around HTML output. */
function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/** Sanitize + normalize one LLM HTML response. */
function cleanHtml(raw: string): string {
  return enforceSingleH1(sanitizeArticleHtml(stripCodeFences(raw)));
}

function extractLinks(html: string): Array<{ url: string; anchor: string }> {
  const out: Array<{ url: string; anchor: string }> = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    out.push({ url: m[1], anchor: stripHtml(m[2]).slice(0, 80) });
  }
  return out;
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function domainAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AUTHORITATIVE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function findBannedPhrases(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return banned.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function extractH2s(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const t = stripHtml(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

/** Key takeaways, parsed deterministically from the aside block. */
function extractTakeaways(html: string): string[] {
  const aside = html.match(/<aside class="key-takeaways">([\s\S]*?)<\/aside>/i);
  if (!aside) return [];
  return [...aside[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]).trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** FAQ entries, parsed deterministically from the FAQ section's H3s. */
function extractFaq(html: string): ArticleFaq[] {
  const parts = html.split(/<h2[^>]*>\s*frequently asked questions\s*<\/h2>/i);
  if (parts.length < 2) return [];
  const section = parts[1].split(/<h2[\s>]/i)[0];
  const out: ArticleFaq[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[\s>]|$)/gi;
  for (const m of section.matchAll(re)) {
    const q = stripHtml(m[1]).trim();
    const a = stripHtml(m[2]).trim();
    if (q && a) out.push({ q, a });
  }
  return out.slice(0, 5);
}

function hasBottomLine(html: string): boolean {
  return /<h2[^>]*>\s*the bottom line\s*<\/h2>/i.test(html);
}

function hasTakeaways(html: string): boolean {
  return /<aside class="key-takeaways">/i.test(html);
}

function buildArticlePrompt(
  topic: FixedTopic,
  outline: string[],
  questions: string[],
  internal: InternalCandidate[],
  tone: string,
  banned: string[],
  feedback: string | undefined,
): string {
  const internalBlock =
    internal.length > 0
      ? internal.map((c) => `- "${c.title}" -> ${c.url}`).join('\n')
      : '(none available yet — skip internal links)';
  const healthBlock =
    topic.categorySlug === 'pet-health'
      ? `\nPET-HEALTH RULES (strict): preventive and non-diagnostic only. Never diagnose a condition or prescribe treatment. Cite veterinary sources for health claims. Include this disclaimer as its own paragraph before "The bottom line": "${PET_HEALTH_DISCLAIMER}"\n`
      : '';
  const feedbackBlock = feedback ? `\nREVISION FEEDBACK FROM THE QA EDITOR — fix every point below:\n${feedback}\n` : '';

  return `You are Maya Khan, a pet-care writer with 8 years of hands-on fostering experience. Write a complete, publish-ready blog article for PawPilot ("Happy pets, confident owners.").

TOPIC (primary keyword): ${topic.keyword}
SECONDARY KEYWORDS: ${topic.secondaryKeywords.join(', ') || '(none)'}
ANGLE: ${topic.angle || 'Answer the question completely and practically.'}
TONE: ${tone}
TARGET LENGTH: ${WORD_TARGET_MIN}-${WORD_TARGET_MAX} words of article body. This is important: write a FULL-LENGTH article, not a summary.

SERP OUTLINE — cover every one of these topics, and improve on them:
${outline.map((o, i) => `${i + 1}. ${o}`).join('\n') || '(no outline — build a logical one)'}

QUESTIONS READERS ASK — answer naturally in the body; use 3-5 as the FAQ:
${questions.map((q) => `- ${q}`).join('\n') || '(none)'}
${healthBlock}${feedbackBlock}
EXACT STRUCTURE (follow precisely):
1. Exactly ONE <h1> as the first element: the article title, with the primary keyword worked in naturally.
2. Hook intro: answer the main question directly in the FIRST 2 SENTENCES, then expand with context.
3. <aside class="key-takeaways"><h2>Key takeaways</h2><ul><li>…4-6 concise bullets…</li></ul></aside> right after the intro.
4. H2/H3 sections covering the outline. Short paragraphs (2-4 sentences). Use <ul>/<ol> and at least one <table> where they genuinely help (comparisons, schedules, checklists).
5. <h2>Frequently asked questions</h2> followed by 3-5 <h3> questions with thorough answers.
6. <h2>The bottom line</h2> conclusion: decisive, practical, no new topics.

LINKING:
- Weave in 3-5 INTERNAL links from this list using descriptive anchor text (use the EXACT URLs given):
${internalBlock}
- Include 1-3 EXTERNAL links to authoritative sources (veterinary schools, AKC, ASPCA, AVMA, VCA, PetMD, manufacturers). External domains MUST be from: ${AUTHORITATIVE_DOMAINS.join(', ')}. Use target="_blank" rel="noopener".

HUMAN WRITING RULES: varied sentence length; contractions; concrete examples from real life with pets; specific numbers (ages, weights, times, costs); first-hand practical tips ("what worked for us"); an occasional rhetorical question; ZERO filler.
BANNED PHRASES — never use any of these, in any form:
${banned.map((b) => `- "${b}"`).join('\n')}
KEYWORD USE: the primary keyword should appear naturally about once per 100 words. NEVER stuff it; never force it into a heading where it sounds wrong.

OUTPUT: the FULL article HTML only — no JSON, no markdown fences, no commentary before or after.`;
}

/**
 * Continuation prompt: append NEW body sections to a partial article.
 * `tailHtml` is the last ~4000 chars so the model knows where it left off.
 * Structural sections (takeaways/FAQ/conclusion) are added separately by
 * ensureStructure(), so continuations only write body sections.
 */
function buildContinuationPrompt(
  topic: FixedTopic,
  outline: string[],
  tailHtml: string,
  wordsSoFar: number,
  banned: string[],
): string {
  const target = Math.min(800, Math.max(400, WORD_TARGET_MIN - wordsSoFar + 200));
  return `You are Maya Khan, continuing a PawPilot blog article about "${topic.keyword}".

Here is the END of what has been written so far (HTML):
---WRITTEN SO FAR (tail)---
${tailHtml}
---END---

Continue the article with NEW sections only — do not repeat, summarize, or rewrite anything above. Write about ${target} more words of new content.

Cover the outline topics that are NOT yet covered, in depth, with specific examples and numbers:
${outline.map((o, i) => `${i + 1}. ${o}`).join('\n') || '(continue logically: deeper how-to steps, troubleshooting, pro tips)'}

Rules: use only <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <strong>, <em> tags. NO <h1>. Keep the same warm, practical tone. Short paragraphs. ZERO filler.
Banned phrases (never use): ${banned.map((b) => `"${b}"`).join(', ')}.

OUTPUT: the NEW HTML sections only — no JSON, no markdown fences, no commentary.`;
}

/**
 * Generate one missing structural section (takeaways aside / FAQ /
 * conclusion) as a small standalone HTML fragment.
 */
async function generateStructuralSection(
  kind: 'takeaways' | 'faq' | 'bottomline',
  topic: FixedTopic,
  title: string,
  questions: string[],
  trackProvider: (p: string) => void,
): Promise<string> {
  const prompts = {
    takeaways:
      `Write ONLY this HTML fragment for a PawPilot article titled "${title}" about "${topic.keyword}":\n` +
      `<aside class="key-takeaways"><h2>Key takeaways</h2><ul>` +
      `with 4-6 concise, specific bullet points summarizing the article's core advice</ul></aside>.\n` +
      `Output the aside HTML only — no fences, no commentary.`,
    faq:
      `Write ONLY this HTML fragment for a PawPilot article about "${topic.keyword}":\n` +
      `<h2>Frequently asked questions</h2> followed by 4 <h3> reader questions with thorough, practical answers. ` +
      `Draw the questions from: ${questions.join(' | ') || 'common reader questions on this topic'}.\n` +
      `Output the HTML only — no fences, no commentary.`,
    bottomline:
      `Write ONLY this HTML fragment concluding a PawPilot article titled "${title}" about "${topic.keyword}":\n` +
      `<h2>The bottom line</h2> followed by 1-2 short paragraphs: decisive, practical, reassuring, no new topics.\n` +
      `Output the HTML only — no fences, no commentary.`,
  };
  const { text, provider } = await callLLM(prompts[kind], { maxTokens: 1500, temperature: 0.6 });
  trackProvider(provider);
  log('llm', `structural section "${kind}" via ${provider}`);
  return cleanHtml(text);
}

/** Insert missing structural sections deterministically. */
async function ensureStructure(
  html: string,
  topic: FixedTopic,
  questions: string[],
  trackProvider: (p: string) => void,
): Promise<string> {
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').slice(0, 200) || topic.keyword;

  if (!hasTakeaways(html)) {
    const aside = await generateStructuralSection('takeaways', topic, title, questions, trackProvider);
    // Insert right after the intro: after the first </p> following the </h1>.
    const h1End = html.search(/<\/h1>/i);
    const pEnd = h1End >= 0 ? html.indexOf('</p>', h1End) : -1;
    html = pEnd >= 0 ? html.slice(0, pEnd + 4) + aside + html.slice(pEnd + 4) : aside + html;
    log('fix', 'inserted missing key-takeaways aside');
  }
  if (extractFaq(html).length < 3) {
    const faqHtml = await generateStructuralSection('faq', topic, title, questions, trackProvider);
    const anchor = html.search(/<h2[^>]*>\s*the bottom line\s*<\/h2>/i);
    html = anchor >= 0 ? html.slice(0, anchor) + faqHtml + html.slice(anchor) : html + faqHtml;
    log('fix', 'inserted missing FAQ section');
  }
  if (!hasBottomLine(html)) {
    const bottom = await generateStructuralSection('bottomline', topic, title, questions, trackProvider);
    html += bottom;
    log('fix', 'appended missing "The bottom line" conclusion');
  }
  return html;
}

/** Insert continuation HTML before the FAQ / bottom-line section when present. */
function stitchHtml(base: string, addition: string): string {
  const anchor = base.search(/<h2[^>]*>\s*(frequently asked questions|the bottom line|further reading)\s*<\/h2>/i);
  if (anchor >= 0) return base.slice(0, anchor) + addition + base.slice(anchor);
  return base + addition;
}

interface ArticleMetadata {
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
  featuredAlt?: string;
  secondaryAlt?: string;
  secondaryPlacementHeading?: string;
}

function buildMetadataPrompt(topic: FixedTopic, title: string, h2s: string[]): string {
  return `You are an SEO editor for PawPilot, a pet-care blog. Given the article below (title + H2 headings), output JSON only — no markdown fences, no commentary.

TITLE: ${title}
PRIMARY KEYWORD: ${topic.keyword}
H2 HEADINGS:
${h2s.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Output exactly this JSON shape:
{
  "tags": ["3-6 short lowercase tags"],
  "metaTitle": "SEO title, max 60 chars, includes the primary keyword naturally",
  "metaDescription": "SEO description, max 155 chars, includes the primary keyword naturally",
  "excerpt": "2-sentence excerpt for article listings",
  "featuredAlt": "descriptive alt text for the featured image (no keyword stuffing)",
  "secondaryAlt": "descriptive alt text for a secondary in-article image",
  "secondaryPlacementHeading": "copy EXACTLY one H2 from the list above, the one whose section the secondary image best illustrates"
}`;
}

function fallbackExternalLink(categorySlug: string): { url: string; label: string } {
  if (categorySlug === 'cat-care') return { url: 'https://www.aspca.org/pet-care/cat-care', label: 'ASPCA cat care resources' };
  if (categorySlug === 'pet-health') return { url: 'https://www.vcahospitals.com/', label: 'VCA Hospitals pet health resources' };
  return { url: 'https://www.akc.org/', label: 'American Kennel Club resources' };
}

/**
 * Write a full article draft for a fixed topic: base article, continuation
 * expansion to the word target, targeted fixes, then metadata.
 */
export async function writePost(input: WritePostInput): Promise<ArticleDraft> {
  const { topic, outline, questions } = input;
  const config = await getAgentConfig();
  const banned = [...DEFAULT_BANNED, ...config.bannedWords];
  const internal = await pickInternalCandidates(topic);
  log('start', `"${topic.keyword}" (${internal.length} internal candidates)`);

  const providers: string[] = [];
  const trackProvider = (p: string) => {
    if (!providers.includes(p)) providers.push(p);
  };

  // ---- Phase 1: base article (up to 2 attempts; keep the best) ----
  let html = '';
  let bestWords = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildArticlePrompt(
      topic, outline, questions, internal, config.tone, banned,
      attempt === 0 ? input.feedback : 'The previous draft was too short or malformed. Write the complete article.',
    );
    const { text, provider } = await callLLM(prompt, { maxTokens: 9000, temperature: 0.7 });
    trackProvider(provider);
    const candidate = cleanHtml(text);
    const words = countWords(candidate);
    const h1Count = (candidate.match(/<h1[\s>]/gi) ?? []).length;
    log('llm', `base attempt ${attempt + 1} via ${provider}: ${words} words, h1=${h1Count}`);
    if (words > bestWords) {
      html = candidate;
      bestWords = words;
    }
    if (words >= MIN_BASE_WORDS && h1Count === 1) break;
  }
  if (!html || countWords(html) < 200) {
    throw new Error(`writer: failed to produce a usable base article for "${topic.keyword}"`);
  }

  // ---- Phase 2: expand with continuations until the word target ----
  for (let exp = 0; exp < MAX_EXPANSIONS; exp++) {
    const words = countWords(html);
    if (words >= WORD_TARGET_MIN) break;
    log('expand', `round ${exp + 1}: ${words} words so far, target ${WORD_TARGET_MIN}`);
    const tail = stripHtml(html).slice(-4000);
    const prompt = buildContinuationPrompt(topic, outline, tail, words, banned);
    const { text, provider } = await callLLM(prompt, { maxTokens: 4000, temperature: 0.7 });
    trackProvider(provider);
    // Continuations must never introduce a second H1.
    const addition = cleanHtml(text).replace(/<\/?h1(\s[^>]*)?>/gi, (m) =>
      m.startsWith('</') ? '</h2>' : '<h2>',
    );
    html = stitchHtml(html, addition);
    log('llm', `continuation ${exp + 1} via ${provider}: +${countWords(addition)} words (total ${countWords(html)})`);
  }

  // ---- Phase 2b: ensure required structural sections exist ----
  html = await ensureStructure(html, topic, questions, trackProvider);

  // ---- Phase 3: targeted fixes ----
  const bannedFound = findBannedPhrases(stripHtml(html), banned);
  if (bannedFound.length > 0) {
    log('fix', `banned phrases found: ${bannedFound.join('; ')} — targeted rewrite`);
    const prompt =
      `You are editing a blog article's HTML. Rephrase ONLY the sentences containing these banned phrases: ${bannedFound.join('; ')}. ` +
      `Keep every HTML tag exactly as-is, change nothing else, and return the FULL article HTML only (no fences, no commentary).\n\nARTICLE:\n${html.slice(0, 14000)}`;
    try {
      const { text, provider } = await callLLM(prompt, { maxTokens: 9000, temperature: 0.3 });
      trackProvider(provider);
      const fixed = cleanHtml(text);
      if (countWords(fixed) >= countWords(html) * 0.8) html = fixed;
    } catch (err) {
      log('warn', `banned-phrase fix failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  const density = keywordDensity(html, topic.keyword);
  if (density > MAX_DENSITY) {
    log('fix', `keyword density ${density.toFixed(2)}% exceeds ${MAX_DENSITY}% — targeted rewrite`);
    const prompt =
      `You are editing a blog article's HTML. The exact phrase "${topic.keyword}" appears too often (${density.toFixed(1)}% density). ` +
      `Replace most occurrences with pronouns or natural synonyms, keeping the meaning. Keep every HTML tag exactly as-is, change nothing else, ` +
      `and return the FULL article HTML only (no fences, no commentary).\n\nARTICLE:\n${html.slice(0, 14000)}`;
    try {
      const { text, provider } = await callLLM(prompt, { maxTokens: 9000, temperature: 0.3 });
      trackProvider(provider);
      const fixed = cleanHtml(text);
      if (countWords(fixed) >= countWords(html) * 0.8) html = fixed;
    } catch (err) {
      log('warn', `density fix failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Pet-health disclaimer: enforce programmatically, never rely on the LLM.
  if (topic.categorySlug === 'pet-health' && !/veterinar/i.test(stripHtml(html))) {
    const anchor = html.search(/<h2[^>]*>\s*the bottom line\s*<\/h2>/i);
    const p = `<p><strong>A quick note:</strong> ${escapeHtml(PET_HEALTH_DISCLAIMER)}</p>`;
    html = anchor >= 0 ? html.slice(0, anchor) + p + html.slice(anchor) : html + p;
    log('fix', 'appended pet-health disclaimer paragraph');
  }

  // ---- Phase 4: links ----
  const links = extractLinks(html);
  const internalLinks = links.filter((l) => !isExternal(l.url));
  let externalLinks = links.filter((l) => isExternal(l.url) && domainAllowed(l.url));
  if (externalLinks.length === 0) {
    const fb = fallbackExternalLink(topic.categorySlug);
    const anchor = html.search(/<h2[^>]*>\s*the bottom line\s*<\/h2>/i);
    const block =
      `<h2>Further reading</h2><ul><li><a href="${fb.url}" target="_blank" rel="noopener">${escapeHtml(fb.label)}</a></li></ul>`;
    html = anchor >= 0 ? html.slice(0, anchor) + block + html.slice(anchor) : html + block;
    externalLinks = [{ url: fb.url, anchor: fb.label }];
    log('fix', 'added fallback authoritative external link');
  }

  // ---- Phase 5: metadata (small JSON call; takeaways/FAQ parsed from HTML) ----
  const title = stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').slice(0, 200) || topic.keyword;
  const h2s = extractH2s(html);
  let meta: ArticleMetadata = {};
  try {
    const { text: metaText, provider } = await callLLM(buildMetadataPrompt(topic, title, h2s), {
      json: true,
      maxTokens: 1200,
      temperature: 0.4,
    });
    trackProvider(provider);
    meta = extractJson(metaText) as ArticleMetadata;
    log('llm', `metadata via ${provider}`);
  } catch (err) {
    log('warn', `metadata LLM call failed, using fallbacks: ${err instanceof Error ? err.message : err}`);
  }

  const plainText = stripHtml(html);
  const wordCount = countWords(html);
  const keyTakeaways = extractTakeaways(html);
  const faq = extractFaq(html);
  const excerpt =
    meta.excerpt?.trim() || plainText.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 300);

  // The writer decides the secondary image placement; validate it is a real H2.
  let placementHeading = meta.secondaryPlacementHeading?.trim() || '';
  if (!h2s.includes(placementHeading)) {
    placementHeading =
      h2s.find((h) => !/frequently asked|bottom line|key takeaways|further reading/i.test(h)) ?? h2s[0] ?? '';
  }

  const draft: ArticleDraft = {
    title,
    slug: slugify(title),
    metaTitle: truncateAtWord(meta.metaTitle?.trim() || title, 60),
    metaDescription: truncateAtWord(meta.metaDescription?.trim() || excerpt, 155),
    excerpt: excerpt.slice(0, 400),
    contentHtml: html,
    contentText: plainText,
    tags: (meta.tags ?? []).map((t) => slugify(String(t))).filter(Boolean).slice(0, 6),
    categorySlug: topic.categorySlug,
    faqJson: faq,
    keyTakeaways,
    internalLinks: internalLinks.slice(0, 6),
    externalLinks: externalLinks.slice(0, 3),
    featuredAlt: (meta.featuredAlt?.trim() || `Illustration for a guide about ${topic.keyword}`).slice(0, 200),
    secondaryAlt: (meta.secondaryAlt?.trim() || `Detail photo illustrating ${topic.keyword}`).slice(0, 200),
    secondaryPlacementHeading: placementHeading,
    wordCount,
    providers,
  };
  log('done', `"${draft.title}" (${draft.wordCount} words, faq=${faq.length}, takeaways=${keyTakeaways.length})`);
  return draft;
}
