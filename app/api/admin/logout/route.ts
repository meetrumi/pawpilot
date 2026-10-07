// POST /api/admin/logout — clears the session cookie.

import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
