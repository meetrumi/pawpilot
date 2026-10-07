// POST /api/admin/agent/run — trigger a manual agent run now.
// POST /api/admin/agent/retry — reset topics from failed runs and re-run.
//
// Both lazily import Phase C's lib/agent/pipeline.ts. When the pipeline has
// not landed yet, they return 501 with a clear message instead of crashing.

import { NextRequest, NextResponse } from 'next/server';
import { loadAgentPipeline, pipelineMissingResponse } from '@/lib/admin/phase-c';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    const pipeline = await loadAgentPipeline();
    if (!pipeline) {
      return NextResponse.json(pipelineMissingResponse(), { status: 501 });
    }
    const result = await pipeline.runDailyAgent('manual');
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
