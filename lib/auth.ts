// PawPilot admin authentication (server-only).
//
// Password login + optional TOTP 2FA, HS256 session JWTs, CSRF claim binding,
// login-attempt audit, and per-IP+username rate limiting.
//
// SECURITY NOTES (read before touching):
// - This module must only ever be imported from Server Components, Route
//   Handlers, or other server-only modules. It reads secrets from env and must
//   never be bundled for the browser.
// - The JWT signing key is derived as SHA256("pawpilot-admin-session:v1:" +
//   ADMIN_PASSWORD_HASH). Rotating the admin password therefore invalidates
//   every existing session immediately (the key changes, old signatures fail).
// - Cookie name is `__Host-paw-admin` in production (requires Secure + Path=/,
//   enforced by browsers for the __Host- prefix) and `paw-admin` in
//   development (no Secure so http://localhost works). Cookie Path is `/` in
//   both: the admin APIs live at /api/admin/* and must receive the session
//   cookie (a Path of ADMIN_PATH would break every authenticated API call),
//   and __Host- mandates Path=/ in prod anyway, so dev matches prod.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { verify as verifyTotp } from 'otplib';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { db } from './db';
import { checkRateLimit, resetRateLimit } from './rate-limit';

/**
 * Session lifetimes.
 * - Default (unchecked "Remember me"): 24h.
 * - Remember-me checked: 30 days.
 * Both the JWT `exp` claim and the cookie `maxAge` use the same value so a
 * remembered session genuinely survives 30 days.
 */
export const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h
export const REMEMBER_ME_TTL_SECONDS = 30 * 24 * 60 * 60; // 30d
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15min

/** Admin roles. The env-based admin (ADMIN_USERNAME) is the super-admin with
 * full access. Child users created in the Team section are editors. */
export type AdminRole = 'superadmin' | 'editor';

export interface AdminSession {
  username: string;
  role: AdminRole;
  /** 'env' for the env super-admin, otherwise the AdminUser id. */
  userId: string;
  csrf: string;
  expiresAt: number;
}

/** Thrown by requireSession()/verifyCsrf(); route handlers map it to an HTTP status. */
export class AdminAuthError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export type LoginResult =
  | { ok: true; jwt: string; csrf: string; ttlSeconds: number }
  | { ok: false; locked: true; retryAfterMs: number }
  | { ok: false; locked: false; error: string; status: number };

/** sha256 hex digest. Used for IP hashing (audit log, rate-limit keys). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time string comparison (via hashed digests, so lengths don't leak). */
function timingSafeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** HMAC-less key derivation for the session JWT. Password rotation => new key => old sessions die. */
function sessionKey(): Uint8Array {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? '';
  return createHash('sha256')
    .update(`pawpilot-admin-session:v1:${passwordHash}`, 'utf8')
    .digest();
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Cookie name: __Host- prefix in prod (mandates Secure), plain name in dev. */
export function sessionCookieName(): string {
  return isProduction() ? '__Host-paw-admin' : 'paw-admin';
}

export function adminBasePath(): string {
  const p = (process.env.ADMIN_PATH || '/paw-admin-7f3k2').trim();
  return p.startsWith('/') ? p : `/${p}`;
}

export function isTotpEnabled(): boolean {
  return Boolean(process.env.TOTP_SECRET && process.env.TOTP_SECRET.trim().length > 0);
}

/** Best-effort client IP for audit/rate-limiting (never trusted for auth decisions). */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}

async function recordLoginAttempt(
  username: string,
  ipHash: string,
  success: boolean,
): Promise<void> {
  try {
    await db.adminLoginAttempt.create({
      data: { username, ipHash, success },
    });
  } catch (err) {
    // Audit logging must never break the login flow itself.
    console.error('[admin-auth] failed to record login attempt', err);
  }
}

async function createSessionToken(
  username: string,
  role: AdminRole,
  userId: string,
  ttlSeconds: number,
): Promise<{ jwt: string; csrf: string }> {
  const csrf = randomBytes(32).toString('hex');
  const jwt = await new SignJWT({ csrf, role, userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(sessionKey());
  return { jwt, csrf };
}

/**
 * Authenticate an admin login attempt.
 *
 * - Rate limit: 5 failed attempts per 15 minutes per (ip, username) -> lockout.
 * - Every attempt (success, failure, lockout-blocked) is written to AdminLoginAttempt.
 * - The env-based admin (ADMIN_USERNAME) logs in as role "superadmin".
 * - Child users in the AdminUser table log in as role "editor", only when
 *   isActive. Deactivated/unknown users get "Invalid credentials."
 *   (no user enumeration).
 * - When TOTP_SECRET is set, a valid TOTP `token` is required for the env
 *   super-admin. Child users authenticate with password only.
 * - `opts.rememberMe`: 30-day session; otherwise 24h. The returned
 *   ttlSeconds is used for both the JWT exp and the cookie maxAge.
 * - On success the in-memory failure budget for the key is cleared.
 */
export async function login(
  username: string,
  password: string,
  ip: string,
  token?: string,
  opts?: { rememberMe?: boolean },
): Promise<LoginResult> {
  const cleanUsername = username.trim();
  const ipHash = sha256Hex(ip);
  const rateKey = `login:${ipHash}:${cleanUsername}`;

  const configuredUser = process.env.ADMIN_USERNAME ?? '';
  const configuredHash = process.env.ADMIN_PASSWORD_HASH ?? '';
  if (!configuredUser || !configuredHash) {
    await recordLoginAttempt(cleanUsername, ipHash, false);
    return {
      ok: false,
      locked: false,
      error: 'Admin login is not configured on this server.',
      status: 503,
    };
  }

  const rl = await checkRateLimit(rateKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    await recordLoginAttempt(cleanUsername, ipHash, false);
    return { ok: false, locked: true, retryAfterMs: rl.retryAfterMs };
  }

  // timing-safe username compare + bcrypt (constant-time by design) for the password.
  const isEnvUser = timingSafeCompare(cleanUsername, configuredUser);
  // Child users (Team) are looked up only when the username is not the env admin.
  // When no user matches at all we still bcrypt-compare against the env hash so
  // the response timing does not reveal whether the username exists.
  const child = isEnvUser
    ? null
    : await db.adminUser.findUnique({ where: { username: cleanUsername } });
  const userOk = isEnvUser || child !== null;
  const hashToCheck = isEnvUser ? configuredHash : (child?.passwordHash ?? configuredHash);
  const passOk = await bcrypt.compare(password, hashToCheck);
  const activeOk = isEnvUser || (child?.isActive ?? false);

  let totpOk = true;
  if (isEnvUser && isTotpEnabled()) {
    const secret = process.env.TOTP_SECRET as string;
    const cleanToken = (token ?? '').replace(/\s+/g, '');
    try {
      // epochTolerance: 30 accepts tokens from the adjacent 30s step too,
      // tolerating clock drift between server and authenticator app
      // (standard TOTP practice, cf. RFC 6238 §5.2).
      const result = await verifyTotp({ secret, token: cleanToken, epochTolerance: 30 });
      totpOk = result.valid === true;
    } catch {
      totpOk = false;
    }
  }

  const ok = userOk && passOk && totpOk && activeOk;
  await recordLoginAttempt(cleanUsername, ipHash, ok);

  if (!ok) {
    return { ok: false, locked: false, error: 'Invalid credentials.', status: 401 };
  }

  await resetRateLimit(rateKey);
  const role: AdminRole = isEnvUser ? 'superadmin' : 'editor';
  const userId = isEnvUser ? 'env' : (child as { id: string }).id;
  const ttlSeconds = opts?.rememberMe ? REMEMBER_ME_TTL_SECONDS : DEFAULT_SESSION_TTL_SECONDS;
  const { jwt, csrf } = await createSessionToken(cleanUsername, role, userId, ttlSeconds);
  return { ok: true, jwt, csrf, ttlSeconds };
}

/** Read and verify the session cookie. Returns null when absent/invalid/expired.
 *
 * For editor sessions the AdminUser row is re-checked on every request: a
 * deleted or deactivated user loses access immediately, even with a
 * still-valid JWT. */
export async function getSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const raw = store.get(sessionCookieName())?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, sessionKey(), {
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.csrf !== 'string') {
      return null;
    }
    const role: AdminRole = payload.role === 'editor' ? 'editor' : 'superadmin';
    const userId = typeof payload.userId === 'string' ? payload.userId : 'env';
    if (role === 'editor') {
      const child = await db.adminUser.findUnique({ where: { id: userId } });
      if (!child || !child.isActive) return null;
    }
    return {
      username: payload.sub,
      role,
      userId,
      csrf: payload.csrf,
      expiresAt: typeof payload.exp === 'number' ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

/** Like getSession() but throws AdminAuthError(401) when there is no valid session. */
export async function requireSession(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) {
    throw new AdminAuthError(401, 'Not authenticated. Please log in.');
  }
  return session;
}

/**
 * Role gate for super-admin-only routes. Throws AdminAuthError(403) when the
 * session role is not in `roles`. Pair with requireSession() or use the
 * `roles` option of requireAdmin() in lib/admin/route.ts.
 */
export function requireRole(session: AdminSession, roles: readonly AdminRole[]): void {
  if (!roles.includes(session.role)) {
    throw new AdminAuthError(403, 'Forbidden: this area is restricted to the super-admin.');
  }
}

/**
 * Page-level guard for super-admin-only admin pages. Redirects editors (and
 * signed-out visitors, though the protected layout already handles those) to
 * the admin dashboard. Call at the top of a Server Component.
 */
export async function requireSuperAdminPage(): Promise<AdminSession> {
  const session = await getSession();
  if (!session || session.role !== 'superadmin') {
    redirect(adminBasePath());
  }
  return session;
}

/**
 * CSRF check for mutating /api/admin/* routes. The client must send the
 * `x-csrf-token` header matching the `csrf` claim in the session JWT.
 * Throws AdminAuthError(403) on mismatch.
 */
export function verifyCsrf(req: NextRequest, session: AdminSession): void {
  const sent = req.headers.get('x-csrf-token') ?? '';
  if (!sent || !timingSafeCompare(sent, session.csrf)) {
    throw new AdminAuthError(403, 'Invalid CSRF token.');
  }
}

/** Set the session cookie after a successful login (call inside a Route Handler).
 * maxAgeSeconds comes from the login result (24h default, 30d when the user
 * checked "Remember me") and matches the JWT exp. */
export async function setSessionCookie(jwt: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  const prod = isProduction();
  store.set(sessionCookieName(), jwt, {
    httpOnly: true,
    secure: prod, // __Host- prefix REQUIRES Secure; dev uses plain name without it.
    sameSite: 'strict',
    // NOTE: Path=/ (not ADMIN_PATH). The admin APIs live at /api/admin/* and
    // must receive the session cookie; a Path of ADMIN_PATH would prevent the
    // browser from sending it there, breaking every authenticated API call.
    // This also matches the __Host- requirement (Path=/ is mandatory) in prod,
    // keeping dev and prod behavior identical. HttpOnly + SameSite=Strict (+
    // Secure in prod) keep the cookie safe; it is only useful on admin routes.
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Clear the session cookie (call inside a Route Handler). Clears both names defensively. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const prod = isProduction();
  for (const name of [sessionCookieName(), prod ? 'paw-admin' : '__Host-paw-admin']) {
    store.set(name, '', {
      httpOnly: true,
      secure: prod,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  }
}
