// Slot guardian: the "1 hour before" safety net.
//
// The daily batch run (01:00 UTC) pre-generates the day's posts, but if it
// fails — or the user changes publish times mid-day — slots can go empty.
// This guardian runs every 30 minutes (GitHub Actions) and guarantees that
// every publish slot in the next 90 minutes has a post ready, generating
// just-in-time when needed. Generation takes ~5 minutes for a single post,
// so content is ready roughly 1 hour before its publish time.
//
// Safety:
//   - Uses the same 'daily-agent' job lock, so it never overlaps the batch.
//   - Checks slot occupancy before generating (no duplicates).
//   - Respects postsPerDay (never over-generates for the day).

import { db } from '../db';
import { getAgentConfig } from '../settings';
import { researchTopics } from './research';
import {
  generatePost,
  nextPublishSlots,
  withJobLock,
  JOB_LOCK_TTL_MS,
} from './pipeline';
import type { FixedTopic } from './types';

export interface GuardianResult {
  ok: boolean;
  slotsChecked: number;
  slotsFilled: number;
  reason?: string;
}

function scoresTotal(scoresJson: string): number {
  try {
    const parsed = JSON.parse(scoresJson) as { total?: number };
    return typeof parsed.total === 'number' ? parsed.total : 0;
  } catch {
    return 0;
  }
}

/** Start of today in the given IANA timezone, as a UTC Date. */
function todayStartUtc(timezone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // Reinterpret the Y/M/D as UTC midnight, then correct by the zone offset.
  const guess = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
  const offsetMin = -tzOffsetMinutes(guess, timezone);
  return new Date(guess.getTime() + offsetMin * 60_000);
}

function tzOffsetMinutes(instant: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export async function runSlotGuardian(): Promise<GuardianResult> {
  const { claimed, result } = await withJobLock('daily-agent', JOB_LOCK_TTL_MS, async () => {
    const config = await getAgentConfig();
    if (!config.enabled) {
      return { ok: true, slotsChecked: 0, slotsFilled: 0, reason: 'agent disabled' };
    }
    const tz = config.timezone || 'Asia/Karachi';
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 90 * 60_000);

    const slots = (await nextPublishSlots(48)).filter(
      (s) => s.getTime() > now.getTime() && s.getTime() <= windowEnd.getTime(),
    );
    if (slots.length === 0) {
      return { ok: true, slotsChecked: 0, slotsFilled: 0, reason: 'no slots in window' };
    }

    // Daily cap: never exceed postsPerDay.
    const dayStart = todayStartUtc(tz);
    let createdToday = await db.post.count({ where: { createdAt: { gte: dayStart } } });

    let filled = 0;
    for (const slot of slots) {
      if (createdToday >= config.postsPerDay) break;

      // Slot occupied? (a scheduled or recently-published post within ±10 min)
      const lo = new Date(slot.getTime() - 10 * 60_000);
      const hi = new Date(slot.getTime() + 10 * 60_000);
      const occupied = await db.post.findFirst({
        where: {
          status: { in: ['scheduled', 'published'] },
          OR: [
            { scheduledFor: { gte: lo, lte: hi } },
            { publishAt: { gte: lo, lte: hi } },
          ],
        },
        select: { id: true },
      });
      if (occupied) continue;

      // Pick the best pending topic; research more if the queue is empty.
      let pending = await db.topicQueue.findMany({
        where: { status: 'pending' },
        include: { category: true },
      });
      if (pending.length === 0) {
        const tmpRun = await db.agentRun.create({
          data: { mode: config.mode, trigger: 'guardian-research', status: 'running', postsPlanned: 0 },
        });
        try {
          await researchTopics(tmpRun.id);
        } finally {
          await db.agentRun.update({
            where: { id: tmpRun.id },
            data: { status: 'success', finishedAt: new Date() },
          });
        }
        pending = await db.topicQueue.findMany({
          where: { status: 'pending' },
          include: { category: true },
        });
      }
      if (pending.length === 0) break; // nothing to write about

      const best = pending
        .map((row) => ({ row, total: scoresTotal(row.scoresJson) }))
        .sort((a, b) => b.total - a.total || a.row.createdAt.getTime() - b.row.createdAt.getTime())[0].row;

      const topic: FixedTopic = {
        keyword: best.keyword,
        secondaryKeywords: best.secondaryKeywords,
        searchIntent: best.searchIntent,
        categorySlug: best.category?.slug ?? 'dog-training',
        rationale: best.rationale,
      };

      try {
        if (config.mode === 'full-auto') {
          await db.topicQueue.update({ where: { id: best.id }, data: { status: 'approved' } });
        }
        await generatePost(topic, { scheduledFor: slot });
        await db.topicQueue.update({ where: { id: best.id }, data: { status: 'used' } });
        createdToday++;
        filled++;
        console.log(`[guardian] filled slot ${slot.toISOString()} with "${topic.keyword}"`);
      } catch (err) {
        console.error(`[guardian] failed to fill slot ${slot.toISOString()}:`, err);
        // Leave the slot for the next guardian pass (30 min later).
      }
    }

    return { ok: true, slotsChecked: slots.length, slotsFilled: filled };
  });

  if (!claimed) {
    return { ok: true, slotsChecked: 0, slotsFilled: 0, reason: 'lock held (another run active)' };
  }
  return result!;
}
