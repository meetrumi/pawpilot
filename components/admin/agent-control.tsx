'use client';

// Agent control center: configuration form (Setting keys), masked API key
// status, manual run / retry triggers, and the run history with expandable
// per-stage logs.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminApiError, useAdminFetch } from './admin-context';
import { COMMON_TIMEZONES } from '@/lib/admin/schedule';
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  PageHeader,
  Spinner,
  SuccessAlert,
  btnPrimary,
  btnSecondary,
  inputClass,
} from './ui';

interface AgentConfig {
  enabled: boolean;
  mode: 'review-first' | 'full-auto';
  postsPerDay: number;
  publishTimes: string[];
  timezone: string;
  tone: string;
  bannedWords: string[];
  wordCountTarget: number;
  refreshEnabled: boolean;
}

interface Stage {
  id: string;
  stage: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  log: string;
  error: string | null;
}

interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  mode: string;
  trigger: string;
  status: string;
  postsPlanned: number;
  postsCreated: number;
  error: string | null;
  stages: Stage[];
  _count: { stages: number };
}

interface ApiKey {
  label: string;
  set: boolean;
  hint: string;
}

export function AgentControl({
  initialConfig,
  initialRuns,
  apiKeys,
}: {
  initialConfig: AgentConfig;
  initialRuns: Run[];
  apiKeys: ApiKey[];
}) {
  const router = useRouter();
  const adminFetch = useAdminFetch();

  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [mode, setMode] = useState(initialConfig.mode);
  const [postsPerDay, setPostsPerDay] = useState(String(initialConfig.postsPerDay));
  const [publishTimes, setPublishTimes] = useState(initialConfig.publishTimes.join(', '));
  const [timezone, setTimezone] = useState(initialConfig.timezone);
  const [tone, setTone] = useState(initialConfig.tone);
  const [bannedWords, setBannedWords] = useState(initialConfig.bannedWords.join('\n'));
  const [wordCountTarget, setWordCountTarget] = useState(String(initialConfig.wordCountTarget));
  const [refreshEnabled, setRefreshEnabled] = useState(initialConfig.refreshEnabled);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const times = publishTimes.split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of times) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
        return setError(`Invalid publish time "${t}". Use HH:MM 24-hour format.`);
      }
    }
    const ppd = Number.parseInt(postsPerDay, 10);
    const wct = Number.parseInt(wordCountTarget, 10);
    if (!Number.isFinite(ppd) || ppd < 1 || ppd > 10) return setError('Posts per day must be 1–10.');
    if (!Number.isFinite(wct) || wct < 300 || wct > 6000) return setError('Word count target must be 300–6000.');

    setSaving(true);
    try {
      await adminFetch('/api/admin/agent/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_enabled: enabled,
          agent_mode: mode,
          posts_per_day: ppd,
          publish_times: times,
          timezone,
          tone_instructions: tone.trim(),
          banned_words: bannedWords.split('\n').map((w) => w.trim()).filter(Boolean),
          word_count_target: wct,
          refresh_enabled: refreshEnabled,
        }),
      });
      setNotice('Agent settings saved.');
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setError(null);
    setNotice(null);
    setLastResult(null);
    setRunning(true);
    try {
      const d = (await adminFetch('/api/admin/agent/run', { method: 'POST' })) as {
        result?: unknown;
      };
      setNotice('Manual run finished.');
      setLastResult(JSON.stringify(d.result ?? null, null, 2));
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Run failed.');
    } finally {
      setRunning(false);
    }
  }

  async function retryFailed() {
    setError(null);
    setNotice(null);
    setLastResult(null);
    setRetrying(true);
    try {
      const d = (await adminFetch('/api/admin/agent/retry', { method: 'POST' })) as {
        resetTopics?: number;
        failedRuns?: number;
        result?: unknown;
      };
      setNotice(
        `Retry finished. Re-queued ${d.resetTopics ?? 0} topic(s) from ${d.failedRuns ?? 0} failed run(s).`,
      );
      setLastResult(JSON.stringify(d.result ?? null, null, 2));
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Agent Control Center"
        subtitle="Configure the content agent, inspect API keys, and trigger runs."
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={retryFailed} disabled={retrying || running}>
              {retrying ? 'Retrying…' : 'Retry failed'}
            </button>
            <button type="button" className={btnPrimary} onClick={runNow} disabled={running || retrying}>
              {running ? 'Running…' : '▶ Run now'}
            </button>
          </>
        }
      />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />
      {running && <Spinner label="Agent is running — this can take a few minutes. The page will refresh when it finishes." />}

      {lastResult && (
        <Card className="mb-6">
          <h2 className="mb-2 text-base font-bold text-ink">Last run result</h2>
          <pre className="max-h-64 overflow-auto rounded-lg bg-stone-900 p-4 text-xs text-stone-100">
            {lastResult}
          </pre>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={saveSettings} className="space-y-5 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">Schedule & mode</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-brand-700" />
                Agent enabled
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={refreshEnabled} onChange={(e) => setRefreshEnabled(e.target.checked)} className="h-4 w-4 accent-brand-700" />
                Weekly refresh of old posts
              </label>
              <Field label="Mode">
                <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as 'review-first' | 'full-auto')}>
                  <option value="review-first">review-first (human approves before publish)</option>
                  <option value="full-auto">full-auto (publish automatically)</option>
                </select>
              </Field>
              <Field label="Posts per day" hint="1–10">
                <input type="number" min={1} max={10} className={inputClass} value={postsPerDay} onChange={(e) => setPostsPerDay(e.target.value)} />
              </Field>
              <Field label="Publish times" hint="Comma-separated HH:MM, 24-hour.">
                <input className={inputClass} value={publishTimes} onChange={(e) => setPublishTimes(e.target.value)} placeholder="09:00, 14:00, 19:00" />
              </Field>
              <Field label="Timezone">
                <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                  {!COMMON_TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                </select>
              </Field>
              <Field label="Word count target" hint="300–6000">
                <input type="number" min={300} max={6000} step={50} className={inputClass} value={wordCountTarget} onChange={(e) => setWordCountTarget(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">Content guidance</h2>
            <div className="space-y-4">
              <Field label="Tone instructions" hint="Guides every generated article.">
                <textarea className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)} rows={4} maxLength={8000} />
              </Field>
              <Field label="Banned words" hint="One per line. The agent avoids these.">
                <textarea className={inputClass} value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} rows={4} />
              </Field>
            </div>
          </Card>

          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save agent settings'}
          </button>
        </form>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">API keys</h2>
            <p className="mb-3 text-xs text-ink-soft">
              Read from server environment. Only the last 4 characters are shown — full values never leave the server.
            </p>
            <ul className="divide-y divide-stone-100">
              {apiKeys.map((k) => (
                <li key={k.label} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-semibold text-ink">{k.label}</span>
                  <span className={`font-mono text-xs ${k.set ? 'text-brand-700' : 'text-stone-400'}`}>
                    {k.hint}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-bold text-ink">How runs work</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li><strong className="text-ink">Run now</strong> triggers the daily agent pipeline immediately (manual trigger).</li>
              <li><strong className="text-ink">Retry failed</strong> moves unused topics from failed runs back to approved, then runs the pipeline.</li>
              <li>Runs are recorded below with per-stage logs for debugging.</li>
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-8">
        <h2 className="mb-3 text-base font-bold text-ink">Run history</h2>
        {initialRuns.length === 0 ? (
          <EmptyState message="No agent runs yet." />
        ) : (
          <div className="space-y-2">
            {initialRuns.map((run) => (
              <details key={run.id} className="rounded-lg border border-stone-200 bg-stone-50">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Badge value={run.status} />
                  <span className="font-semibold text-ink">
                    {run.trigger} · {run.mode}
                  </span>
                  <span className="text-ink-soft">
                    {new Date(run.startedAt).toLocaleString()} · {run.postsCreated}/{run.postsPlanned} posts · {run._count.stages} stages
                  </span>
                  {run.error && <span className="text-xs text-red-700">error — expand</span>}
                </summary>
                <div className="border-t border-stone-200 px-4 py-3">
                  {run.error && (
                    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{run.error}</p>
                  )}
                  {run.stages.length === 0 ? (
                    <p className="text-xs text-ink-soft">No stage logs for this run.</p>
                  ) : (
                    <ul className="space-y-2">
                      {run.stages.map((s) => (
                        <li key={s.id} className="rounded-lg bg-white p-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge value={s.status} />
                            <strong className="text-ink">{s.stage}</strong>
                            <span className="text-ink-soft">
                              {new Date(s.startedAt).toLocaleTimeString()}
                              {s.finishedAt ? ` → ${new Date(s.finishedAt).toLocaleTimeString()}` : ' → …'}
                            </span>
                          </div>
                          {s.log && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-ink-soft">{s.log.slice(0, 2000)}</pre>}
                          {s.error && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-red-700">{s.error.slice(0, 2000)}</pre>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
