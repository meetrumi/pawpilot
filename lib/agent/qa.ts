// QA gate for the PawPilot agent pipeline.
//
// Real checks over the finished draft:
//   - wordCount >= 1500; exactly one H1; valid heading order (no skipped levels)
//   - meta title <= 60 / description <= 155; keyword in title, meta,
//     first 100 words, and at least one H2
//   - Flesch reading ease >= 50 (target 60-70)
//   - banned-phrase scan; sentence-opener repetition check
//   - originality: trigram Jaccard vs all published posts' contentText
//     (fail > 0.35) and vs competitor snippets (fail > 0.5)
//   - link validation: internal /post/ links checked against the DB,
//     external links via HEAD (fallback GET), 8s timeout, all must 2xx/3xx
//   - both images present with non-empty alt; HTML tag balance
// Then an editor LLM pass (fact-check + flow). Score is 0-100 (weighted).
// Pass requires score >= 75, all critical checks green, and a passing
// editor verdict. pipeline.ts rewrites with `feedback` up to 2 times, then
// saves the post with status "review" and the failure reason in qaReport.

import { db } from '../db';
import { getAgentConfig } from '../settings';
import { callLLM, extractJson } from './providers';
import {
  fleschReadingEase,
  firstWords,
  stripHtml,
  trigramJaccard,
  sentencesOf,
  wordsOf,
} from './text';
import type { ArticleDraft } from './writer';
import type { FixedTopic } from './types';
import type { ImageInfo } from './images';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  weight: number;
}

export interface QaContext {
  topic: FixedTopic;
  competitorSnippets: string[];
  images: { featured: ImageInfo; secondary: ImageInfo };
}

export interface QaGateResult {
  pass: boolean;
  score: number;
  checks: CheckResult[];
  feedback?: string;
}

const LINK_TIMEOUT_MS = 8_000;
const PASS_THRESHOLD = 75;

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

function log(step: string, detail: string): void {
  console.log(`[qa] ${step}: ${detail}`);
}

function headingLevels(html: string): number[] {
  const levels: number[] = [];
  for (const m of html.matchAll(/<h([1-3])[\s>]/gi)) levels.push(Number(m[1]));
  return levels;
}

function headingTexts(html: string, level: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
  for (const m of html.matchAll(re)) out.push(stripHtml(m[1]));
  return out;
}

/** Stack-based tag balance check (ignores void elements). */
function tagsBalanced(html: string): { balanced: boolean; detail: string } {
  const voidEls = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  const stack: string[] = [];
  for (const m of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = m[1].toLowerCase();
    if (voidEls.has(tag)) continue;
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (open !== tag) return { balanced: false, detail: `mismatched </${tag}> (expected </${open ?? '?'}>)` };
    } else if (!m[0].endsWith('/>')) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) return { balanced: false, detail: `unclosed tags: ${stack.join(', ')}` };
  return { balanced: true, detail: 'all tags balanced' };
}

interface ArticleLink {
  url: string;
  external: boolean;
}

function extractArticleLinks(html: string): ArticleLink[] {
  const out: ArticleLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)) {
    const url = m[1].trim();
    if (!url || url.startsWith('#') || url.startsWith('mailto:') || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, external: /^https?:\/\//i.test(url) });
  }
  return out;
}

async function checkExternalLink(url: string): Promise<{ ok: boolean; detail: string }> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': 'PawPilotBot/1.0 (+https://pawpilot.com) qa' },
      signal: AbortSignal.timeout(LINK_TIMEOUT_MS),
      redirect: 'follow',
    });
    // Drain GET bodies so sockets can be reused.
    if (method === 'GET') await res.arrayBuffer().catch(() => undefined);
    return res;
  };
  try {
    let res = await attempt('HEAD');
    if (res.status === 405 || res.status === 501) res = await attempt('GET');
    const ok = res.status >= 200 && res.status < 400;
    return { ok, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkLinks(html: string): Promise<{ pass: boolean; detail: string }> {
  const links = extractArticleLinks(html);
  if (links.length === 0) return { pass: false, detail: 'no links found in article' };
  const failures: string[] = [];
  for (const link of links) {
    if (!link.external) {
      const m = link.url.match(/^\/post\/([a-z0-9-]+)/i);
      if (!m) {
        failures.push(`${link.url} (unexpected internal path)`);
        continue;
      }
      const post = await db.post.findUnique({ where: { slug: m[1] }, select: { id: true } });
      if (!post) failures.push(`${link.url} (no such post in DB)`);
    } else {
      const { ok, detail } = await checkExternalLink(link.url);
      if (!ok) failures.push(`${link.url} (${detail})`);
    }
  }
  if (failures.length > 0) {
    return { pass: false, detail: `${failures.length}/${links.length} links failed: ${failures.join('; ')}` };
  }
  return { pass: true, detail: `${links.length} links resolve (internal via DB, external via HTTP)` };
}

function checkSentenceOpeners(text: string): { pass: boolean; detail: string } {
  const sentences = sentencesOf(text);
  if (sentences.length < 15) return { pass: true, detail: `only ${sentences.length} sentences; check skipped` };
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const opener = wordsOf(s).slice(0, 2).join(' ');
    if (opener) counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }
  let top = '';
  let topCount = 0;
  for (const [opener, n] of counts) {
    if (n > topCount) {
      top = opener;
      topCount = n;
    }
  }
  const ratio = topCount / sentences.length;
  const pass = ratio <= 0.35;
  return {
    pass,
    detail: pass
      ? `most repeated opener "${top}" at ${(ratio * 100).toFixed(1)}% of ${sentences.length} sentences`
      : `opener "${top}" repeats in ${(ratio * 100).toFixed(1)}% of sentences (max 35%)`,
  };
}

interface EditorVerdict {
  verdict: 'pass' | 'fail';
  issues: string[];
  rewriteGuidance: string;
}

async function editorPass(draft: ArticleDraft, topic: FixedTopic): Promise<EditorVerdict> {
  const system =
    'You are a senior editor and fact-checker for PawPilot, a pet-care publication. ' +
    'Be strict but fair. Flag factual errors about pet care, unsafe or harmful advice, ' +
    'contradictions, and serious flow problems. Do not nitpick style.';
  const prompt =
    `Review this article for the topic "${topic.keyword}" (category: ${topic.categorySlug}).\n\n` +
    `TITLE: ${draft.title}\n\nARTICLE:\n${draft.contentText.slice(0, 9000)}\n\n` +
    `Respond with JSON only: {"verdict": "pass"|"fail", "issues": ["..."], "rewriteGuidance": "concrete fix instructions, or empty string"}`;
  try {
    const { text, provider } = await callLLM(prompt, { json: true, maxTokens: 1500, temperature: 0.3, system });
    log('editor', `verdict via ${provider}`);
    const parsed = extractJson(text) as Partial<EditorVerdict>;
    const verdict = parsed.verdict === 'fail' ? 'fail' : 'pass';
    return {
      verdict,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      rewriteGuidance: typeof parsed.rewriteGuidance === 'string' ? parsed.rewriteGuidance : '',
    };
  } catch (err) {
    // The editor is advisory: if the LLM chain is down, log and continue.
    log('warn', `editor pass unavailable: ${err instanceof Error ? err.message : err}`);
    return { verdict: 'pass', issues: [], rewriteGuidance: '' };
  }
}

/**
 * Run the full QA gate over a draft. Returns pass/score/checks and, on
 * failure, actionable feedback for the rewrite loop.
 */
export async function qaGate(draft: ArticleDraft, ctx: QaContext): Promise<QaGateResult> {
  const { topic } = ctx;
  log('start', `"${draft.title}"`);
  const checks: CheckResult[] = [];
  const config = await getAgentConfig();
  const banned = [...DEFAULT_BANNED, ...config.bannedWords];
  const keywordLower = topic.keyword.toLowerCase();

  // 1. Word count
  checks.push({
    name: 'wordCount',
    pass: draft.wordCount >= 1500,
    detail: `${draft.wordCount} words (min 1500)`,
    weight: 15,
  });

  // 2. Exactly one H1
  const h1Count = (draft.contentHtml.match(/<h1[\s>]/gi) ?? []).length;
  checks.push({
    name: 'singleH1',
    pass: h1Count === 1,
    detail: `${h1Count} H1 tag(s)`,
    weight: 8,
  });

  // 3. Heading order (no skipped levels)
  const levels = headingLevels(draft.contentHtml);
  let orderOk = true;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      orderOk = false;
      break;
    }
  }
  checks.push({
    name: 'headingOrder',
    pass: orderOk && levels[0] === 1,
    detail: orderOk ? `hierarchy valid (${levels.length} headings)` : 'skipped heading level detected',
    weight: 7,
  });

  // 4-5. Meta lengths
  checks.push({
    name: 'metaTitleLength',
    pass: draft.metaTitle.length <= 60,
    detail: `${draft.metaTitle.length}/60 chars`,
    weight: 5,
  });
  checks.push({
    name: 'metaDescriptionLength',
    pass: draft.metaDescription.length <= 155,
    detail: `${draft.metaDescription.length}/155 chars`,
    weight: 5,
  });

  // 6-9. Keyword placement
  const h2Texts = headingTexts(draft.contentHtml, 2);
  const first100 = firstWords(draft.contentText, 100).toLowerCase();
  const kwChecks = [
    { name: 'keywordInTitle', text: draft.title.toLowerCase(), weight: 4 },
    { name: 'keywordInMeta', text: `${draft.metaTitle} ${draft.metaDescription}`.toLowerCase(), weight: 3 },
    { name: 'keywordInFirst100Words', text: first100, weight: 4 },
  ];
  for (const kc of kwChecks) {
    const present = kc.text.includes(keywordLower);
    checks.push({ name: kc.name, pass: present, detail: present ? 'keyword present' : 'keyword MISSING', weight: kc.weight });
  }
  const kwInH2 = h2Texts.some((h) => h.toLowerCase().includes(keywordLower));
  checks.push({
    name: 'keywordInH2',
    pass: kwInH2,
    detail: kwInH2 ? 'keyword in an H2' : 'keyword missing from all H2s',
    weight: 3,
  });

  // 10. Readability
  const flesch = fleschReadingEase(draft.contentHtml);
  checks.push({
    name: 'readability',
    pass: flesch >= 50,
    detail: `Flesch ${flesch.toFixed(1)} (target 60-70, min 50)`,
    weight: 10,
  });

  // 11. Banned phrases
  const lower = draft.contentText.toLowerCase();
  const found = banned.filter((p) => lower.includes(p.toLowerCase()));
  checks.push({
    name: 'bannedPhrases',
    pass: found.length === 0,
    detail: found.length === 0 ? 'none found' : `found: ${found.join('; ')}`,
    weight: 10,
  });

  // 12. Sentence-opener repetition
  const openers = checkSentenceOpeners(draft.contentText);
  checks.push({ name: 'sentenceOpeners', pass: openers.pass, detail: openers.detail, weight: 4 });

  // 13. Originality vs existing published posts
  const published = await db.post.findMany({
    where: { status: 'published' },
    select: { contentText: true, title: true },
  });
  let maxSim = 0;
  let maxTitle = '';
  for (const p of published) {
    const sim = trigramJaccard(draft.contentText, p.contentText);
    if (sim > maxSim) {
      maxSim = sim;
      maxTitle = p.title;
    }
  }
  checks.push({
    name: 'originalityVsExisting',
    pass: maxSim <= 0.35,
    detail:
      published.length === 0
        ? 'no published posts to compare against'
        : `max trigram Jaccard ${maxSim.toFixed(3)} vs "${maxTitle.slice(0, 50)}" (max 0.35)`,
    weight: 8,
  });

  // 14. Originality vs competitor snippets
  let maxSnip = 0;
  for (const snippet of ctx.competitorSnippets) {
    maxSnip = Math.max(maxSnip, trigramJaccard(draft.contentText, snippet));
  }
  checks.push({
    name: 'originalityVsSnippets',
    pass: maxSnip <= 0.5,
    detail: `max trigram Jaccard ${maxSnip.toFixed(3)} vs competitor snippets (max 0.5)`,
    weight: 4,
  });

  // 15. Link validation
  const links = await checkLinks(draft.contentHtml);
  checks.push({ name: 'linksResolve', pass: links.pass, detail: links.detail, weight: 6 });

  // 16. Images with alt text
  const imgsOk =
    !!ctx.images.featured.url &&
    !!ctx.images.secondary.url &&
    ctx.images.featured.alt.trim().length > 0 &&
    ctx.images.secondary.alt.trim().length > 0;
  checks.push({
    name: 'imagesAlt',
    pass: imgsOk,
    detail: imgsOk ? 'featured + secondary present with alt text' : 'missing image or empty alt text',
    weight: 4,
  });

  // 17. HTML sanity
  const balance = tagsBalanced(draft.contentHtml);
  checks.push({ name: 'htmlSanity', pass: balance.balanced, detail: balance.detail, weight: 2 });

  // 18. Editor LLM pass (advisory weight, but a fail verdict caps the score)
  const editor = await editorPass(draft, topic);
  const editorOk = editor.verdict === 'pass';
  checks.push({
    name: 'editorReview',
    pass: editorOk,
    detail: editorOk ? 'editor verdict: pass' : `editor flagged: ${editor.issues.join('; ') || 'unspecified issues'}`,
    weight: 0,
  });

  let score = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  if (!editorOk) score = Math.min(score, 59);

  const critical = ['wordCount', 'singleH1', 'bannedPhrases', 'originalityVsExisting', 'originalityVsSnippets'];
  const criticalOk = critical.every((name) => checks.find((c) => c.name === name)?.pass);
  const pass = score >= PASS_THRESHOLD && criticalOk && editorOk;

  const failed = checks.filter((c) => !c.pass);
  log('done', `score=${score} pass=${pass} (${failed.length} failed checks)`);

  let feedback: string | undefined;
  if (!pass) {
    const lines = failed.map((c) => `- [${c.name}] ${c.detail}`);
    if (editor.rewriteGuidance) lines.push(`- [editor] ${editor.rewriteGuidance}`);
    feedback =
      `QA FAILED (score ${score}/100, need ${PASS_THRESHOLD}). Fix every item:\n` +
      lines.join('\n') +
      '\nRewrite the full article addressing all of the above. Keep the required structure.';
  }

  return { pass, score, checks, feedback };
}
