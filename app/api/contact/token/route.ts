import { createHmac, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { getTokenSecret } from '@/lib/http';

const MIN_AGE_MS = 3_000; // reject tokens younger than 3s (time-trap)
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // tokens expire after 2h

function sign(ts: number): string {
  const payload = String(ts);
  const sig = createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/** Verify a token minted by GET /api/contact/token. */
export function verifyContactToken(token: string): { ok: boolean; reason?: string } {
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'invalid' };
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const ts = Number(payload);
  if (!Number.isFinite(ts) || ts <= 0) return { ok: false, reason: 'invalid' };

  const expected = createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid' };
  }
  const age = Date.now() - ts;
  if (age < MIN_AGE_MS) return { ok: false, reason: 'too-fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/** Mint a fresh HMAC-signed timestamp token for the contact form. */
export async function GET(): Promise<Response> {
  await connection(); // request-time only: never prerender/cache a token
  const token = sign(Date.now());
  return Response.json({ token });
}
