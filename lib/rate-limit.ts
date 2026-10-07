// Real in-memory sliding-window rate limiter. No external service.
// NOTE: state is per-process; on multi-instance deploys treat this as a
// first line of defense, not a distributed guarantee.

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const windows = new Map<string, number[]>();

// Bound memory: prune empty/stale buckets once the map grows large.
function maybePrune(now: number): void {
  if (windows.size < 10_000) return;
  for (const [key, stamps] of windows) {
    const fresh = stamps.filter((t) => t > now - 3_600_000);
    if (fresh.length === 0) windows.delete(key);
    else windows.set(key, fresh);
  }
}

/**
 * Sliding-window rate limit: at most `limit` hits per `windowMs` for `key`.
 * Returns whether the hit is allowed and, when denied, how long to wait.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  maybePrune(now);
  const cutoff = now - windowMs;

  let stamps = windows.get(key) ?? [];
  stamps = stamps.filter((t) => t > cutoff);

  if (stamps.length >= limit) {
    const oldest = stamps[0];
    windows.set(key, stamps);
    return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }

  stamps.push(now);
  windows.set(key, stamps);
  return { allowed: true, retryAfterMs: 0 };
}

/** Test/ops helper: clear all buckets (or one key). */
export async function resetRateLimit(key?: string): Promise<void> {
  if (key) windows.delete(key);
  else windows.clear();
}
