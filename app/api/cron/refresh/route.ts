// Refresh cron (weekly): LLM-refresh the stalest published posts.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized, newRequestToken } from '../auth';
import { claimJobLock, releaseJobLock, refreshOldPosts } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const lockedBy = newRequestToken('cron-refresh');
  const claimed = await claimJobLock('refresh', lockedBy, 3_600_000);
  if (!claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  try {
    const result = await refreshOldPosts({ skipLock: true, trigger: 'cron' });
    return NextResponse.json(result);
  } finally {
    await releaseJobLock('refresh', lockedBy);
  }
}
