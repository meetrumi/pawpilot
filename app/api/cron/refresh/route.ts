// Refresh cron (weekly): LLM-refresh the stalest published posts.
//
// Scheduling: GitHub Actions is the PRIMARY driver (runs the same pipeline
// directly in the Actions runner, where long LLM runs are not subject to the
// Vercel serverless timeout). This Vercel cron is the BACKUP: it only runs
// when the Actions job didn't claim the lock. The lock has a 30-minute TTL
// with a heartbeat, so a timed-out Vercel invocation clears itself instead
// of blocking the next runner for hours.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized } from '../auth';
import { JOB_LOCK_TTL_MS, refreshOldPosts, withJobLock } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const r = await withJobLock('refresh', JOB_LOCK_TTL_MS, async () =>
    refreshOldPosts({ skipLock: true, trigger: 'cron' }),
  );
  if (!r.claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  return NextResponse.json(r.result);
}
