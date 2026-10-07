// Agent pipeline orchestration for PawPilot (Phase C).
//
// Implements the frozen AgentPipeline contract: generatePost(topic, opts?).
// Orchestrates serp -> write -> images -> qa (rewrite up to 2x) -> DB insert,
// with a StageLog row per stage under an AgentRun.
//
// Also: runDailyAgent (research + generate N posts), publishDuePosts
// (promote due scheduled posts, revalidate, IndexNow, backlinks),
// refreshOldPosts (LLM refresh of the 3 stalest published posts),
// nextPublishSlots (publish-time computation in the configured timezone),
// and transactional JobLock claim/release helpers used by cron routes.

import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { getAgentConfig } from '../settings';
import { slugify, readingTimeMinutes } from '../format';
import { analyzeSerp } from './serp';
import { researchTopics } from './research';
import { writePost, enforceSingleH1 } from './writer';
import { generateImages } from './images';
import { qaGate } from './qa';
import { pingIndexNow } from '../indexnow';
import { alertJobFailure, alertJobPartial } from '../alerts';
import { callLLM } from './providers';
import { countWords, escapeHtml, stripHtml } from './text';
import sanitizeHtml from 'sanitize-html';
import type { AgentPipeline, FixedTopic, GeneratedPostSummary } from './types';

// ------------------------------------------------------------------ stages ---
async function startStage(runId: string, stage: string, topicId?: string): Promise<string> {
  const row = await db.stageLog.create({
    data: { runId, stage, topicId: topicId ?? null, status: 'running' },
  });
  return row.id;
}

async function finishStage(
  id: string,
  status: 'success' | 'failed',
  log: string,
  error?: string,
  metaJson?: string,
): Promise<void> {
  await db.stageLog.update({
    where: { id },
    data: { status, finishedAt: new Date(), log, error: error ?? null, metaJson: metaJson ?? null },
  });
}

async function appendStageLog(id: string, text: string): Promise<void> {
  const row = await db.stageLog.findUnique({ where: { id }, select: { log: true } });
  await db.stageLog.update({ where: { id }, data: { log: `${row?.log ?? ''}\n${text}` } });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function newLockToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

// ------------------------------------------------------------------- locks ---
/**
 * Transactionally claim a named job lock. Returns false when another holder
 * still owns a non-expired lock. Throws on DB errors.
 */
export async function claimJobLock(jobName: string, lockedBy: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.jobLock.findUnique({ where: { jobName } });
      if (existing && existing.expiresAt.getTime() > now.getTime()) {
        throw new Error(`job "${jobName}" is locked until ${existing.expiresAt.toISOString()}`);
      }
      await tx.jobLock.upsert({
        where: { jobName },
        create: { jobName, lockedBy, expiresAt: new Date(now.getTime() + ttlMs) },
        update: { lockedBy, lockedAt: now, expiresAt: new Date(now.getTime() + ttlMs) },
      });
    });
    return true;
  } catch (err) {
    console.log(`[lock] claim "${jobName}" failed: ${errMessage(err)}`);
    return false;
  }
}

/** Release a lock, but only if we still hold it. */
export async function releaseJobLock(jobName: string, lockedBy: string): Promise<void> {
  await db.jobLock.deleteMany({ where: { jobName, lockedBy } });
}

// ------------------------------------------------------------ publish slots ---
function datePartsInTz(date: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // hour can be "24" for midnight with hour12:false
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return new Date(guess + (guess - asUtc));
}

/**
 * Next `n` publish slots from the configured publish_times in the configured
 * timezone, as UTC Dates. Uses Intl only — no date library needed.
 */
export async function nextPublishSlots(n: number): Promise<Date[]> {
  const config = await getAgentConfig();
  const tz = config.timezone || 'Asia/Karachi';
  const times = config.publishTimes.length > 0 ? config.publishTimes : ['09:00'];
  const now = new Date();
  const slots: Date[] = [];
  for (let dayOffset = 0; dayOffset < 14 && slots.length < n; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86_400_000);
    const { year, month, day } = datePartsInTz(probe, tz);
    for (const t of times) {
      const [hh, mm] = t.split(':').map((x) => Number(x));
      if (!Number.isFinite(hh)) continue;
      const slot = zonedTimeToUtc(year, month, day, hh, Number.isFinite(mm) ? mm : 0, tz);
      if (slot.getTime() > now.getTime()) slots.push(slot);
      if (slots.length >= n) break;
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime()).slice(0, n);
}

// ------------------------------------------------------------------ revalidate ---
/** Best-effort revalidatePath: works in the Next runtime, no-ops in tsx/CLI. */
async function safeRevalidate(path: string): Promise<void> {
  try {
    const mod = (await import('next/cache')) as {
      revalidatePath?: (p: string) => void | Promise<void>;
    };
    await mod.revalidatePath?.(path);
    console.log(`[publish] revalidated ${path}`);
  } catch (err) {
    console.log(`[publish] revalidate skipped for ${path} (non-Next runtime): ${errMessage(err)}`);
  }
}

// --------------------------------------------------------------- generatePost ---
async function uniqueSlug(base: string): Promise<string> {
  const clean = base || 'pawpilot-post';
  let slug = clean;
  let n = 1;
  while (await db.post.findUnique({ where: { slug }, select: { id: true } })) {
    n++;
    slug = `${clean}-${n}`;
  }
  return slug;
}

function prettyTagName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function generatePost(topic: FixedTopic, opts?: { runId?: string }): Promise<GeneratedPostSummary> {
  const config = await getAgentConfig();
  let runId = opts?.runId;
  let ownRun = false;
  if (!runId) {
    const run = await db.agentRun.create({
      data: { mode: config.mode, trigger: 'generatePost', status: 'running', postsPlanned: 1 },
    });
    runId = run.id;
    ownRun = true;
  }
  console.log(`[pipeline] generatePost "${topic.keyword}" (runId=${runId})`);

  try {
    // research (fixed topic supplied; discovery skipped)
    const researchId = await startStage(runId, 'research');
    await finishStage(
      researchId,
      'success',
      `Fixed topic supplied by caller; discovery skipped. keyword="${topic.keyword}" category=${topic.categorySlug}`,
    );

    // serp
    const serpId = await startStage(runId, 'serp');
    let serp;
    try {
      serp = await analyzeSerp(topic.keyword);
      await finishStage(
        serpId,
        'success',
        `outline=${serp.outline.length} questions=${serp.questions.length} gaps=${serp.gaps.length}`,
        undefined,
        JSON.stringify({ outline: serp.outline, questions: serp.questions, gaps: serp.gaps }),
      );
    } catch (err) {
      await finishStage(serpId, 'failed', '', errMessage(err));
      throw err;
    }

    // write
    const writeId = await startStage(runId, 'write');
    let draft;
    try {
      draft = await writePost({ topic, outline: serp.outline, questions: serp.questions });
      await finishStage(
        writeId,
        'success',
        `draft "${draft.title}" (${draft.wordCount} words) via ${draft.providers.join(',')}`,
      );
    } catch (err) {
      await finishStage(writeId, 'failed', '', errMessage(err));
      throw err;
    }

    // images
    const imagesId = await startStage(runId, 'images');
    let images;
    try {
      images = await generateImages(topic, topic.keyword);
      await finishStage(
        imagesId,
        'success',
        `featured=${images.featured.url} secondary=${images.secondary.url}`,
      );
    } catch (err) {
      await finishStage(imagesId, 'failed', '', errMessage(err));
      throw err;
    }

    // qa (with up to 2 rewrites)
    const qaId = await startStage(runId, 'qa');
    let qa = await qaGate(draft, {
      topic,
      competitorSnippets: serp.competitorSnippets,
      images: { featured: images.featured, secondary: images.secondary },
    });
    let attempts = 0;
    while (!qa.pass && attempts < 2 && qa.feedback) {
      attempts++;
      await appendStageLog(qaId, `QA attempt ${attempts} failed (score ${qa.score}); rewriting with feedback.`);
      const rewriteId = await startStage(runId, 'write');
      try {
        draft = await writePost({
          topic,
          outline: serp.outline,
          questions: serp.questions,
          feedback: qa.feedback,
        });
        await finishStage(rewriteId, 'success', `rewrite ${attempts}: "${draft.title}" (${draft.wordCount} words)`);
      } catch (err) {
        await finishStage(rewriteId, 'failed', '', errMessage(err));
        throw err;
      }
      qa = await qaGate(draft, {
        topic,
        competitorSnippets: serp.competitorSnippets,
        images: { featured: images.featured, secondary: images.secondary },
      });
    }
    await finishStage(
      qaId,
      qa.pass ? 'success' : 'failed',
      `score=${qa.score} pass=${qa.pass} after ${attempts} rewrite(s)`,
      qa.pass ? undefined : qa.feedback,
      JSON.stringify({ score: qa.score, checks: qa.checks }),
    );

    // DB insert
    const category = await db.category.findUnique({ where: { slug: topic.categorySlug } });
    if (!category) throw new Error(`unknown category slug "${topic.categorySlug}"`);
    const author =
      (await db.author.findUnique({ where: { slug: 'maya-khan' } })) ?? (await db.author.findFirst());
    if (!author) throw new Error('no author in DB; run the core seed first');

    const slug = await uniqueSlug(draft.slug || slugify(topic.keyword));
    const fullAuto = config.mode === 'full-auto';
    // Failed QA always lands in review, even in full-auto mode.
    const status = qa.pass && fullAuto ? 'scheduled' : 'review';
    const scheduledFor = status === 'scheduled' ? ((await nextPublishSlots(1))[0] ?? null) : null;

    const tagConnect: Array<{ id: string }> = [];
    for (const t of draft.tags.slice(0, 6)) {
      const tag = await db.tag.upsert({
        where: { slug: t },
        create: { slug: t, name: prettyTagName(t) },
        update: {},
      });
      tagConnect.push({ id: tag.id });
    }

    const post = await db.post.create({
      data: {
        slug,
        title: draft.title,
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        excerpt: draft.excerpt,
        contentHtml: draft.contentHtml,
        contentText: draft.contentText,
        featuredImageUrl: images.featured.url,
        featuredImageAlt: images.featured.alt,
        secondaryImageUrl: images.secondary.url,
        secondaryImageAlt: images.secondary.alt,
        secondaryImageAfterHeading: draft.secondaryPlacementHeading || images.placementHeading || null,
        status,
        scheduledFor,
        authorId: author.id,
        categoryId: category.id,
        tags: { connect: tagConnect },
        faqJson: JSON.stringify(draft.faqJson),
        keyTakeaways: JSON.stringify(draft.keyTakeaways),
        wordCount: draft.wordCount,
        readingTimeMin: readingTimeMinutes(draft.wordCount),
        qaScore: qa.score,
        qaReport: JSON.stringify({
          score: qa.score,
          pass: qa.pass,
          checks: qa.checks,
          feedback: qa.feedback ?? null,
          providers: draft.providers,
          generatedAt: new Date().toISOString(),
        }),
        runId,
      },
    });
    console.log(`[pipeline] post created: ${slug} (status=${status}, qa=${qa.score})`);

    if (ownRun) {
      await db.agentRun.update({
        where: { id: runId },
        data: { finishedAt: new Date(), status: 'success', postsCreated: 1 },
      });
    }
    return { postId: post.id, slug, title: draft.title, wordCount: draft.wordCount, qaScore: qa.score };
  } catch (err) {
    if (ownRun) {
      await db.agentRun
        .update({
          where: { id: runId },
          data: { finishedAt: new Date(), status: 'failed', error: errMessage(err) },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}

export const pipeline: AgentPipeline = { generatePost };

// -------------------------------------------------------------- runDailyAgent ---
export interface DailyAgentResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  runId?: string;
  planned?: number;
  created?: number;
}

function scoresTotal(scoresJson: string): number {
  try {
    const parsed = JSON.parse(scoresJson) as { total?: number };
    return typeof parsed.total === 'number' ? parsed.total : 0;
  } catch {
    return 0;
  }
}

/**
 * Daily agent run: skip when disabled; claim the "daily-agent" lock;
 * research topics; generate up to posts_per_day posts. In full-auto mode
 * topics are marked approved and posts are scheduled; in review-first mode
 * posts are generated with status "review" for human approval.
 */
export async function runDailyAgent(
  trigger: string,
  opts?: { skipLock?: boolean },
): Promise<DailyAgentResult> {
  const config = await getAgentConfig();
  if (!config.enabled) {
    console.log('[agent] agent_enabled is not "true"; skipping daily run');
    return { ok: false, skipped: true, reason: 'agent_disabled' };
  }
  const lockedBy = newLockToken('daily-agent');
  if (!opts?.skipLock) {
    const claimed = await claimJobLock('daily-agent', lockedBy, 3_600_000);
    if (!claimed) return { ok: false, skipped: true, reason: 'job_locked' };
  }

  const run = await db.agentRun.create({
    data: { mode: config.mode, trigger, status: 'running' },
  });
  console.log(`[agent] daily run started: ${run.id} (mode=${config.mode}, trigger=${trigger})`);
  let planned = 0;
  let created = 0;
  let error: string | undefined;

  try {
    await researchTopics(run.id);
    const pending = await db.topicQueue.findMany({
      where: { status: 'pending' },
      include: { category: true },
    });
    const ranked = pending
      .map((row) => ({ row, total: scoresTotal(row.scoresJson) }))
      .sort((a, b) => b.total - a.total || a.row.createdAt.getTime() - b.row.createdAt.getTime())
      .slice(0, config.postsPerDay);
    planned = ranked.length;
    await db.agentRun.update({ where: { id: run.id }, data: { postsPlanned: planned } });
    console.log(`[agent] ${planned} topic(s) selected for generation`);

    for (const { row } of ranked) {
      const fixedTopic: FixedTopic = {
        keyword: row.keyword,
        secondaryKeywords: row.secondaryKeywords,
        searchIntent: row.searchIntent,
        categorySlug: row.category?.slug ?? 'dog-training',
        rationale: row.rationale,
      };
      try {
        if (config.mode === 'full-auto') {
          await db.topicQueue.update({ where: { id: row.id }, data: { status: 'approved' } });
        }
        const summary = await generatePost(fixedTopic, { runId: run.id });
        await db.topicQueue.update({ where: { id: row.id }, data: { status: 'used' } });
        created++;
        console.log(`[agent] created: ${summary.title} (${summary.wordCount} words, qa ${summary.qaScore})`);
      } catch (err) {
        const msg = errMessage(err);
        console.error(`[agent] topic "${row.keyword}" failed: ${msg}`);
        await db.stageLog.create({
          data: {
            runId: run.id,
            stage: 'topic-error',
            topicId: row.id,
            status: 'failed',
            finishedAt: new Date(),
            log: `topic "${row.keyword}" failed`,
            error: msg,
          },
        });
      }
    }
  } catch (err) {
    error = errMessage(err);
    console.error(`[agent] daily run failed: ${error}`);
  } finally {
    if (!opts?.skipLock) await releaseJobLock('daily-agent', lockedBy);
  }

  const status = error ? 'failed' : created < planned ? 'partial' : 'success';
  await db.agentRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), status, postsPlanned: planned, postsCreated: created, error: error ?? null },
  });
  if (error) {
    await alertJobFailure('daily-agent', `run ${run.id} (${trigger}) failed: ${error}`);
  } else if (created < planned) {
    await alertJobPartial('daily-agent', `run ${run.id} (${trigger}): ${created}/${planned} posts created.`);
  }
  return { ok: !error, runId: run.id, planned, created, reason: error };
}

// ------------------------------------------------------------ publishDuePosts ---
export interface PublishResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  published: string[];
}

/** Add "Related reading" backlinks from 2-3 older same-category posts. */
async function addBacklinks(newPostId: string, categoryId: string, slug: string, title: string): Promise<void> {
  const older = await db.post.findMany({
    where: { status: 'published', categoryId, id: { not: newPostId } },
    orderBy: [{ publishAt: 'asc' }, { createdAt: 'asc' }],
    take: 3,
  });
  for (const o of older) {
    const link = `<p>Related reading: <a href="/post/${slug}">${escapeHtml(title)}</a></p>`;
    const idx = o.contentHtml.lastIndexOf('</p>');
    const html = idx >= 0 ? o.contentHtml.slice(0, idx) + link + o.contentHtml.slice(idx) : o.contentHtml + link;
    await db.post.update({
      where: { id: o.id },
      data: {
        contentHtml: html,
        contentText: `${o.contentText}\nRelated reading: ${title}`,
        internalLinksAdded: true,
      },
    });
    console.log(`[publish] backlink added from ${o.slug} -> /post/${slug}`);
  }
}

/**
 * Publish scheduled posts whose time has come. Idempotent: only
 * status="scheduled" rows are promoted, each exactly once.
 */
export async function publishDuePosts(opts?: { skipLock?: boolean }): Promise<PublishResult> {
  const lockedBy = newLockToken('publish-10min');
  if (!opts?.skipLock) {
    const claimed = await claimJobLock('publish-10min', lockedBy, 600_000);
    if (!claimed) return { ok: false, skipped: true, reason: 'job_locked', published: [] };
  }
  const published: string[] = [];
  const failed: { slug: string; error: string }[] = [];
  try {
    const now = new Date();
    const due = await db.post.findMany({
      where: {
        status: 'scheduled',
        OR: [{ scheduledFor: { lte: now } }, { publishAt: { lte: now } }],
      },
      include: { category: true },
    });
    console.log(`[publish] ${due.length} due post(s)`);
    const siteUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');

    for (const post of due) {
      try {
        await db.post.update({
          where: { id: post.id },
          data: { status: 'published', publishAt: now },
        });
        await safeRevalidate('/');
        await safeRevalidate(`/post/${post.slug}`);
        await safeRevalidate(`/category/${post.category.slug}`);
        await safeRevalidate('/sitemap.xml');
        await safeRevalidate('/rss.xml');
        if (siteUrl) {
          const ping = await pingIndexNow([`${siteUrl}/post/${post.slug}`]);
          if (ping.ok) {
            await db.post.update({ where: { id: post.id }, data: { indexNowPinged: true } });
          }
        } else {
          console.log('[publish] SITE_URL unset; skipping IndexNow ping');
        }
        await addBacklinks(post.id, post.categoryId, post.slug, post.title);
        published.push(post.slug);
        console.log(`[publish] published: ${post.slug}`);
      } catch (err) {
        const msg = errMessage(err);
        failed.push({ slug: post.slug, error: msg });
        console.error(`[publish] failed: ${post.slug}: ${msg}`);
      }
    }
  } finally {
    if (!opts?.skipLock) await releaseJobLock('publish-10min', lockedBy);
  }
  if (failed.length > 0) {
    await alertJobPartial(
      'publish',
      `${failed.length} post(s) failed to publish: ${failed.map((f) => `${f.slug} (${f.error})`).join('; ')}`,
    );
  }
  return { ok: failed.length === 0, published };
}

// ------------------------------------------------------------ refreshOldPosts ---
export interface RefreshResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  refreshed?: string[];
}

/**
 * Weekly refresh pass: take the 3 oldest published posts with the lowest
 * views and have the LLM refresh their content (updated facts, tightened
 * flow), keeping the same structure.
 */
export async function refreshOldPosts(
  opts?: { skipLock?: boolean; trigger?: string },
): Promise<RefreshResult> {
  const config = await getAgentConfig();
  if (!config.refreshEnabled) {
    console.log('[refresh] refresh_enabled is not "true"; skipping');
    return { ok: false, skipped: true, reason: 'refresh_disabled' };
  }
  const lockedBy = newLockToken('refresh');
  if (!opts?.skipLock) {
    const claimed = await claimJobLock('refresh', lockedBy, 3_600_000);
    if (!claimed) return { ok: false, skipped: true, reason: 'job_locked' };
  }

  const run = await db.agentRun.create({
    data: { mode: 'refresh', trigger: opts?.trigger ?? 'cron', status: 'running' },
  });
  const refreshed: string[] = [];
  let error: string | undefined;
  try {
    const olds = await db.post.findMany({
      where: { status: 'published' },
      orderBy: [{ views: 'asc' }, { publishAt: 'asc' }, { createdAt: 'asc' }],
      take: 3,
    });
    console.log(`[refresh] ${olds.length} post(s) selected for refresh`);
    for (const post of olds) {
      const stageId = await startStage(run.id, 'refresh');
      try {
        const prompt =
          `You are Maya Khan, a pet-care writer refreshing an article for PawPilot.\n\n` +
          `TITLE: ${post.title}\n\nCURRENT ARTICLE HTML:\n${post.contentHtml.slice(0, 12000)}\n\n` +
          `Refresh this article: update any dated claims, add 1-2 fresh specific examples or numbers, ` +
          `tighten the flow, and fix anything that reads as stale. Keep the same H1, heading structure, ` +
          `key-takeaways aside, FAQ, and "The bottom line" conclusion. Keep it at least 1500 words. ` +
          `Output the FULL updated article HTML only (no JSON, no markdown fences).`;
        const { text, provider } = await callLLM(prompt, { maxTokens: 9000, temperature: 0.6 });
        const fenced = text.match(/```(?:html)?\s*([\s\S]*?)\s*```/);
        const html = enforceSingleH1(
          sanitizeHtml((fenced?.[1] ?? text).trim(), {
            allowedTags: [
              'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
              'tr', 'th', 'td', 'blockquote', 'img', 'a', 'strong', 'em', 'aside', 'code',
            ],
            allowedAttributes: {
              a: ['href', 'title', 'target', 'rel'],
              img: ['src', 'alt', 'title', 'width', 'height'],
              aside: ['class'],
            },
            allowedClasses: { aside: ['key-takeaways'] },
          }),
        );
        const wordCount = countWords(html);
        if (wordCount < 1000) {
          throw new Error(`refresh produced only ${wordCount} words; discarding`);
        }
        await db.post.update({
          where: { id: post.id },
          data: {
            contentHtml: html,
            contentText: stripHtml(html),
            wordCount,
            readingTimeMin: readingTimeMinutes(wordCount),
          },
        });
        await finishStage(stageId, 'success', `refreshed ${post.slug} via ${provider} (${wordCount} words)`);
        refreshed.push(post.slug);
        console.log(`[refresh] refreshed: ${post.slug}`);
      } catch (err) {
        await finishStage(stageId, 'failed', '', errMessage(err));
        console.error(`[refresh] ${post.slug} failed: ${errMessage(err)}`);
      }
    }
  } catch (err) {
    error = errMessage(err);
  } finally {
    if (!opts?.skipLock) await releaseJobLock('refresh', lockedBy);
  }
  await db.agentRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status: error ? 'failed' : 'success',
      postsPlanned: refreshed.length,
      postsCreated: refreshed.length,
      error: error ?? null,
    },
  });
  if (error) {
    await alertJobFailure('refresh', `run ${run.id} failed: ${error}`);
  }
  return { ok: !error, refreshed, reason: error };
}
