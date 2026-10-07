// Daily agent cron: research topics and generate the day's posts.
// Accepts ?mode=once (runs a single cycle through the normal flow).
//
// Scheduling: GitHub Actions is the PRIMARY driver (runs the same pipeline
// directly in the Actions runner at 01:00 UTC, where long LLM runs are not
// subject to the Vercel serverless timeout). This Vercel cron at 01:35 UTC is
// the BACKUP: it only runs when the Actions job didn't claim the job lock.
// The lock has a 30-minute TTL with a heartbeat, so a timed-out Vercel
// invocation clears itself instead of blocking the next runner for hours.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized } from '../auth';
import { JOB_LOCK_TTL_MS, runDailyAgent, withJobLock } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const mode = req.nextUrl.searchParams.get('mode');
  const r = await withJobLock('daily-agent', JOB_LOCK_TTL_MS, async () =>
    runDailyAgent(mode === 'once' ? 'cron-once' : 'cron', { skipLock: true }),
  );
  if (!r.claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  return NextResponse.json({ mode: mode ?? 'default', ...r.result });
}
