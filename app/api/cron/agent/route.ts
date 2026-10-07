// Daily agent cron: research topics and generate the day's posts.
// Accepts ?mode=once (runs a single cycle through the normal flow).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized, newRequestToken } from '../auth';
import { claimJobLock, releaseJobLock, runDailyAgent } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const mode = req.nextUrl.searchParams.get('mode');
  const lockedBy = newRequestToken('cron-agent');
  const claimed = await claimJobLock('daily-agent', lockedBy, 3_600_000);
  if (!claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  try {
    const result = await runDailyAgent(mode === 'once' ? 'cron-once' : 'cron', { skipLock: true });
    return NextResponse.json({ mode: mode ?? 'default', ...result });
  } finally {
    await releaseJobLock('daily-agent', lockedBy);
  }
}
