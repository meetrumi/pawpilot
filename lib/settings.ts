import { db } from './db';

/** Read a raw setting, falling back when the row is absent. */
export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

/** Create or update a setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export type AgentMode = 'review-first' | 'full-auto';

export interface AgentConfig {
  enabled: boolean;
  mode: AgentMode;
  postsPerDay: number;
  publishTimes: string[];
  timezone: string;
  tone: string;
  bannedWords: string[];
  wordCountTarget: number;
  refreshEnabled: boolean;
}

const DEFAULTS: AgentConfig = {
  enabled: true,
  mode: 'review-first',
  postsPerDay: 3,
  publishTimes: ['09:00', '14:00', '19:00'],
  timezone: 'Asia/Karachi',
  tone: 'Warm, practical, and reassuring. Written for everyday pet owners, not experts. Plain English, short paragraphs, actionable advice in every section.',
  bannedWords: [],
  wordCountTarget: 1500,
  refreshEnabled: true,
};

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function parseIntSetting(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseStringArray(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed;
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}

/** Full agent configuration resolved from the Setting table with sane defaults. */
export async function getAgentConfig(): Promise<AgentConfig> {
  const [
    enabled,
    mode,
    postsPerDay,
    publishTimes,
    timezone,
    tone,
    bannedWords,
    wordCountTarget,
    refreshEnabled,
  ] = await Promise.all([
    getSetting('agent_enabled', String(DEFAULTS.enabled)),
    getSetting('agent_mode', DEFAULTS.mode),
    getSetting('posts_per_day', String(DEFAULTS.postsPerDay)),
    getSetting('publish_times', JSON.stringify(DEFAULTS.publishTimes)),
    getSetting('timezone', DEFAULTS.timezone),
    getSetting('tone_instructions', DEFAULTS.tone),
    getSetting('banned_words', JSON.stringify(DEFAULTS.bannedWords)),
    getSetting('word_count_target', String(DEFAULTS.wordCountTarget)),
    getSetting('refresh_enabled', String(DEFAULTS.refreshEnabled)),
  ]);

  return {
    enabled: parseBoolean(enabled, DEFAULTS.enabled),
    mode: mode === 'full-auto' ? 'full-auto' : 'review-first',
    postsPerDay: parseIntSetting(postsPerDay, DEFAULTS.postsPerDay),
    publishTimes: parseStringArray(publishTimes, DEFAULTS.publishTimes),
    timezone: timezone || DEFAULTS.timezone,
    tone: tone || DEFAULTS.tone,
    bannedWords: parseStringArray(bannedWords, DEFAULTS.bannedWords),
    wordCountTarget: parseIntSetting(wordCountTarget, DEFAULTS.wordCountTarget),
    refreshEnabled: parseBoolean(refreshEnabled, DEFAULTS.refreshEnabled),
  };
}
