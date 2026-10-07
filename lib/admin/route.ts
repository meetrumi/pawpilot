// Shared helpers for /api/admin/* route handlers: session + CSRF gating and
// consistent JSON error responses. Server-side only.

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  AdminAuthError,
  AdminSession,
  requireSession,
  verifyCsrf,
} from '@/lib/auth';

/**
 * Gate an admin API route: valid session required; CSRF token required for
 * anything that mutates (POST/PUT/PATCH/DELETE). Throws AdminAuthError.
 *
 * Calls connection() first so admin APIs are always request-time only and
 * never statically prerendered (with cacheComponents, GET handlers would
 * otherwise be prerendered at build time).
 */
export async function requireAdmin(
  req: NextRequest,
  opts: { csrf: boolean },
): Promise<AdminSession> {
  await connection();
  const session = await requireSession();
  if (opts.csrf) verifyCsrf(req, session);
  return session;
}

/** Map thrown errors to JSON responses. Never leaks secrets or stack traces. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AdminAuthError) {
    return NextResponse.json(
      { error: err.message, ...(err.extra ?? {}) },
      { status: err.status },
    );
  }
  // Plain errors carrying an explicit HTTP status (e.g. badRequest()).
  if (
    err instanceof Error &&
    typeof (err as Error & { status?: unknown }).status === 'number'
  ) {
    const status = (err as Error & { status: number }).status;
    if (status >= 400 && status < 600) {
      return NextResponse.json({ error: err.message }, { status });
    }
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed.',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      return NextResponse.json(
        { error: `A record with this ${target || 'unique field'} already exists.` },
        { status: 409 },
      );
    }
    if (err.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete: this record is still referenced by other content.' },
        { status: 409 },
      );
    }
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }
  }
  console.error('[api/admin] unexpected error:', err);
  return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
}

/** Parse a JSON body, returning a 400 response tuple on invalid JSON. */
export async function readJsonBody(req: NextRequest): Promise<{
  ok: true;
  body: unknown;
} | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
    };
  }
}
