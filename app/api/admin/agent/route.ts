// GET /api/admin/agent — agent config, API-key status, recent runs.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAgentConfig } from '@/lib/settings';
import { getApiKeyStatuses } from '@/lib/admin/api-keys';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const [config, runs] = await Promise.all([
      getAgentConfig(),
      db.agentRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 15,
        include: {
          _count: { select: { stages: true } },
          stages: {
            orderBy: { startedAt: 'asc' },
            select: {
              id: true,
              stage: true,
              status: true,
              startedAt: true,
              finishedAt: true,
              log: true,
              error: true,
            },
          },
        },
      }),
    ]);
    return NextResponse.json({
      config,
      apiKeys: getApiKeyStatuses(),
      runs,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
