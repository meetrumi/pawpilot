// Publish cron (every 10 min): promote due scheduled posts to published.
// Lightweight (DB updates + revalidation + IndexNow pings) — safe to run on
// Vercel serverless and via the GitHub Actions backup.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCronAuthorized } from '../auth';
import { publishDuePosts, withJobLock } from '@/lib/agent/pipeline';


export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const r = await withJobLock('publish-10min', 600_000, async () =>
    publishDuePosts({ skipLock: true }),
  );
  if (!r.claimed) {
    return NextResponse.json({ ok: false, reason: 'job_locked' }, { status: 409 });
  }
  return NextResponse.json(r.result);
}
