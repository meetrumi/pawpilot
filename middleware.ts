// PawPilot request pipeline guard (runs on Vercel Edge).
// NOTE: `middleware.ts` is deprecated in Next 16 (renamed to `proxy.ts`), but the
// convention still executes. Kept as middleware.ts per Phase A spec.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_PATH = process.env.ADMIN_PATH || '/paw-admin-7f3k2';
const INTERNAL_ADMIN = '/internal-admin';

function securityHeaders(res: NextResponse): NextResponse {
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // (b) Direct access to /internal-admin is always a 404. Never set ADMIN_PATH
  // to /internal-admin, or the admin would be unreachable.
  if (pathname === INTERNAL_ADMIN || pathname.startsWith(`${INTERNAL_ADMIN}/`)) {
    return securityHeaders(
      new NextResponse('Not Found', { status: 404 }),
    );
  }

  // (a) Obscured admin path rewrites to the internal admin route.
  if (pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(ADMIN_PATH, INTERNAL_ADMIN);
    const res = NextResponse.rewrite(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return securityHeaders(res);
  }

  const res = NextResponse.next();

  // (c) Keep internal surfaces out of search engines.
  if (pathname.startsWith('/api/')) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // (d) Security headers on every response.
  return securityHeaders(res);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
