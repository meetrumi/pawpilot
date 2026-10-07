// Admin dashboard: content counts, agent status, recent runs + stage logs,
// and a 7-day pageview chart (all real data).

import Link from 'next/link';
import { db } from '@/lib/db';
import { getAgentConfig } from '@/lib/settings';
import { adminBasePath } from '@/lib/auth';
import { nextRunDate } from '@/lib/admin/schedule';
import {
  Badge,
  Card,
  PageHeader,
  StatCard,
  EmptyState,
} from '@/components/admin/ui';


interface DayCount {
  day: Date;
  count: number;
}

async function pageViewsLast7Days(): Promise<DayCount[]> {
  // Prisma groupBy can't bucket by day; date_trunc does it in SQL.
  const rows = (await db.$queryRaw`
    SELECT date_trunc('day', "viewedAt") AS day, COUNT(*)::int AS count
    FROM "PageView"
    WHERE "viewedAt" >= NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1 ASC
  `) as DayCount[];
  // Fill missing days with zeros so the chart always shows 7 bars.
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r.count]));
  const out: DayCount[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: new Date(`${key}T00:00:00Z`), count: byDay.get(key) ?? 0 });
  }
  return out;
}

export default async function AdminDashboardPage() {
  const basePath = adminBasePath();
  const [
    postCounts,
    failedRuns,
    pendingTopics,
    unreadInbox,
    agentConfig,
    runs,
    stageLogs,
    views,
  ] = await Promise.all([
    db.post.groupBy({ by: ['status'], _count: { status: true } }),
    db.agentRun.count({ where: { status: 'failed' } }),
    db.topicQueue.count({ where: { status: 'pending' } }),
    db.contactMessage.count({ where: { status: 'new' } }),
    getAgentConfig(),
    db.agentRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { _count: { select: { stages: true } } },
    }),
    db.stageLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: { run: { select: { id: true, trigger: true } } },
    }),
    pageViewsLast7Days(),
  ]);

  const countFor = (status: string) =>
    postCounts.find((c) => c.status === status)?._count.status ?? 0;
  const nextRun = nextRunDate(agentConfig.publishTimes, agentConfig.timezone);
  const maxViews = Math.max(1, ...views.map((v) => v.count));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Site health and agent activity at a glance."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Published" value={countFor('published')} hint={`${countFor('scheduled')} scheduled`} />
        <StatCard label="In review" value={countFor('review')} hint={`${countFor('draft')} drafts`} />
        <StatCard label="Failed agent runs" value={failedRuns} hint="needs attention" />
        <StatCard label="Pending topics" value={pendingTopics} hint="in the queue" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Unread messages" value={unreadInbox} hint="contact inbox" />
        <Card className="col-span-2 lg:col-span-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Agent status
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <Badge value={agentConfig.enabled ? 'success' : 'draft'} />{' '}
              {agentConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className="text-ink-soft">
              Mode: <strong className="text-ink">{agentConfig.mode}</strong>
            </span>
            <span className="text-ink-soft">
              Next run:{' '}
              <strong className="text-ink">
                {agentConfig.enabled && nextRun
                  ? nextRun.toLocaleString('en-US', { timeZone: agentConfig.timezone })
                  : '—'}
              </strong>
            </span>
            <Link
              href={`${basePath}/agent`}
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              Open agent control →
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">Page views — last 7 days</h2>
          {views.every((v) => v.count === 0) ? (
            <EmptyState message="No page views recorded in the last 7 days." />
          ) : (
            <div className="flex h-40 items-end gap-2" role="img" aria-label="Page views per day, last 7 days">
              {views.map((v) => (
                <div key={v.day.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-brand-500"
                    style={{ height: `${Math.max(4, (v.count / maxViews) * 130)}px` }}
                    title={`${v.count} views`}
                  />
                  <div className="text-[10px] font-medium text-ink-soft">
                    {v.day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-[10px] font-bold text-ink">{v.count}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Recent agent runs</h2>
            <Link href={`${basePath}/agent`} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
              All runs →
            </Link>
          </div>
          {runs.length === 0 ? (
            <EmptyState message="No agent runs yet." />
          ) : (
            <ul className="divide-y divide-stone-100">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">
                      {run.trigger} · {run.postsCreated}/{run.postsPlanned} posts
                    </div>
                    <div className="truncate text-xs text-ink-soft">
                      {run.startedAt.toLocaleString()} · {run._count.stages} stages
                      {run.error ? ` · ${run.error.slice(0, 80)}` : ''}
                    </div>
                  </div>
                  <Badge value={run.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-base font-bold text-ink">Recent stage logs (last 20)</h2>
        {stageLogs.length === 0 ? (
          <EmptyState message="No stage logs yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wider text-ink-soft">
                  <th className="py-2 pr-4 font-semibold">Time</th>
                  <th className="py-2 pr-4 font-semibold">Run</th>
                  <th className="py-2 pr-4 font-semibold">Stage</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Log / error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {stageLogs.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-ink-soft">
                      {s.startedAt.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-ink-soft">
                      {s.run.trigger}…{s.run.id.slice(-6)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-medium text-ink">{s.stage}</td>
                    <td className="py-2 pr-4">
                      <Badge value={s.status} />
                    </td>
                    <td className="max-w-[320px] truncate py-2 text-xs text-ink-soft" title={s.error ?? s.log}>
                      {s.error ? `Error: ${s.error}` : s.log.slice(0, 120)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
