// Publish cron (every 10 min): promote due scheduled posts to published.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized, newRequestToken } from '../auth';
import { claimJobLock, releaseJobLock, publishDuePosts } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const lockedBy = newRequestToken('cron-publish');
  const claimed = await claimJobLock('publish-10min', lockedBy, 600_000);
  if (!claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  try {
    const result = await publishDuePosts({ skipLock: true });
    return NextResponse.json(result);
  } finally {
    await releaseJobLock('publish-10min', lockedBy);
  }
}
