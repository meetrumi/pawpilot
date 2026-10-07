// GET /api/admin/totp-status — tells the login page whether TOTP 2FA is
// enabled. Public (needed before login); leaks nothing about the secret.

import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { isTotpEnabled } from '@/lib/auth';

export async function GET() {
  await connection(); // request-time only: reflects current env, never cached
  return NextResponse.json({ totpEnabled: isTotpEnabled() });
}
