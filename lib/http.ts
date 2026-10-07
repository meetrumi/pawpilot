// Small HTTP helpers shared by API routes: client IP extraction and
// SHA-256 hashing (for storing IPs without keeping raw addresses).

import { createHash, randomBytes } from 'node:crypto';

/** Best-effort client IP from proxy headers, else 'unknown'. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

/** One-way hash of an IP for storage (ContactMessage.ipHash, PageView.ipHash). */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`pawpilot-ip:${ip}`).digest('hex');
}

let cachedTokenSecret: string | undefined;

/**
 * HMAC secret for contact-form time-trap tokens. From CONTACT_TOKEN_SECRET
 * in production; otherwise a random per-process secret (safe for dev and
 * single-instance deploys — tokens never leave the process that minted them).
 */
export function getTokenSecret(): string {
  if (cachedTokenSecret) return cachedTokenSecret;
  const fromEnv = process.env.CONTACT_TOKEN_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedTokenSecret = fromEnv;
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[contact] CONTACT_TOKEN_SECRET is unset; using an ephemeral secret. ' +
          'Set CONTACT_TOKEN_SECRET for multi-instance deployments.',
      );
    }
    cachedTokenSecret = randomBytes(32).toString('hex');
  }
  return cachedTokenSecret;
}
