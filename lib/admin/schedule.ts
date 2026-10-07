// Scheduling helpers for the admin dashboard ("next run" display).

/** Current wall-clock parts in an IANA timezone. */
function tzParts(now: Date, timezone: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute') };
}

/**
 * Next scheduled publish time (as a Date) given daily HH:MM times and a
 * timezone. Returns null when no valid times are configured.
 */
export function nextRunDate(publishTimes: string[], timezone: string): Date | null {
  const valid = publishTimes.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort();
  if (valid.length === 0) return null;
  const now = new Date();
  const { h, m } = tzParts(now, timezone);
  const nowMinutes = h * 60 + m;
  for (const t of valid) {
    const [th, tm] = t.split(':').map(Number);
    if (th * 60 + tm > nowMinutes) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      // Compute the instant: we want HH:MM in `timezone`. Approximate by
      // shifting from UTC using the zone offset at that date.
      return zonedTimeToUtc(d, th, tm, timezone);
    }
  }
  // All of today's times passed: first time tomorrow.
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const [th, tm] = valid[0].split(':').map(Number);
  return zonedTimeToUtc(tomorrow, th, tm, timezone);
}

/** Convert a YYYY-MM-DD date + HH:MM wall time in `timezone` to a UTC Date. */
function zonedTimeToUtc(dayUtcMidnight: Date, hh: number, mm: number, timezone: string): Date {
  // Guess: treat the wall time as UTC, then correct by the zone's offset.
  const guess = new Date(dayUtcMidnight);
  guess.setUTCHours(hh, mm, 0, 0);
  const offsetMinutes = -tzOffsetMinutes(guess, timezone);
  return new Date(guess.getTime() + offsetMinutes * 60_000);
}

/** Offset of `timezone` behind/ahead of UTC in minutes at the given instant. */
function tzOffsetMinutes(instant: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** ~20 common IANA timezones for the admin select. */
export const COMMON_TIMEZONES = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'UTC',
];
