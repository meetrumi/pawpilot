// POST /api/admin/login — admin sign-in. Sets the session cookie on success.

import { NextRequest, NextResponse } from 'next/server';
import {
  getClientIp,
  isTotpEnabled,
  login,
  setSessionCookie,
} from '@/lib/auth';
import { loginSchema } from '@/lib/admin/schemas';
import { readJsonBody, toErrorResponse } from '@/lib/admin/route';

export async function POST(req: NextRequest) {
  try {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const data = loginSchema.parse(parsed.body);

    const result = await login(
      data.username,
      data.password,
      getClientIp(req),
      data.token,
    );

    if (!result.ok) {
      if (result.locked) {
        return NextResponse.json(
          {
            error:
              'Too many failed login attempts. This login is temporarily locked — try again later.',
            locked: true,
            retryAfterMs: result.retryAfterMs,
          },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.jwt);
    return NextResponse.json({
      ok: true,
      csrf: result.csrf,
      totpEnabled: isTotpEnabled(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
