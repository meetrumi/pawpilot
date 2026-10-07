// Shared auth for the /api/cron/* routes: require
// `Authorization: Bearer ${CRON_SECRET}` compared with a timing-safe check.
// Not a route file (only route.ts files become routes).

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/** True when the request carries the correct cron bearer token. */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return false;
  // Hash both sides first so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Random per-request lock holder token. */
export function newRequestToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
