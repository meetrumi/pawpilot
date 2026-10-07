// Agent control center page. Server wrapper loads config, key status, runs.

import { db } from '@/lib/db';
import { getAgentConfig } from '@/lib/settings';
import { getApiKeyStatuses } from '@/lib/admin/api-keys';
import { AgentControl } from '@/components/admin/agent-control';


export default async function AdminAgentPage() {
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

  // Serialize dates for the client component.
  const serializedRuns = runs.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    stages: r.stages.map((s) => ({
      ...s,
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
    })),
  }));

  return (
    <AgentControl
      initialConfig={config}
      initialRuns={serializedRuns}
      apiKeys={getApiKeyStatuses()}
    />
  );
}
