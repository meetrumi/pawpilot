// POST /api/admin/agent/retry — re-queue topics from failed runs, then run.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadAgentPipeline, pipelineMissingResponse } from '@/lib/admin/phase-c';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });

    const failedRuns = await db.agentRun.findMany({
      where: { status: 'failed' },
      select: { id: true },
      take: 50,
    });
    const failedIds = failedRuns.map((r) => r.id);

    let resetTopics = 0;
    if (failedIds.length > 0) {
      // Topics claimed by failed runs that were never used go back to the
      // approved pool so the retry can pick them up again.
      const reset = await db.topicQueue.updateMany({
        where: { runId: { in: failedIds }, status: { not: 'used' } },
        data: { status: 'approved' },
      });
      resetTopics = reset.count;
    }

    const pipeline = await loadAgentPipeline();
    if (!pipeline) {
      return NextResponse.json(
        { ...pipelineMissingResponse(), resetTopics, failedRuns: failedIds.length },
        { status: 501 },
      );
    }
    const result = await pipeline.runDailyAgent('retry');
    return NextResponse.json({
      ok: true,
      resetTopics,
      failedRuns: failedIds.length,
      result,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
