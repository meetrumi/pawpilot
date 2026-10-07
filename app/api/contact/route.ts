import { z } from 'zod';
import { db } from '@/lib/db';
import { getClientIp, hashIp } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyContactToken } from './token/route';

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.email('Enter a valid email address').trim().max(254),
  subject: z.string().trim().min(1, 'Subject is required').max(150),
  message: z.string().trim().min(1, 'Message is required').max(5000),
  website: z.string().max(200).optional().default(''), // honeypot
});

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Real send via the Resend HTTP API when configured; otherwise store + log. */
async function maybeSendEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) {
    console.log(
      '[contact] message stored (RESEND_API_KEY/CONTACT_TO_EMAIL unset — no email sent)',
    );
    return;
  }
  const from = process.env.CONTACT_FROM_EMAIL ?? 'PawPilot <noreply@pawpilot.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: input.email,
        subject: `[PawPilot contact] ${input.subject}`,
        text: `Name: ${input.name}\nEmail: ${input.email}\n\n${input.message}`,
      }),
    });
    if (!res.ok) {
      console.error('[contact] Resend send failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[contact] Resend request error:', err);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = await checkRateLimit(
      `contact:${ip}`,
      RATE_LIMIT,
      RATE_WINDOW_MS,
    );
    if (!allowed) {
      const res = json(
        { ok: false, error: 'Too many messages. Please try again later.' },
        429,
      );
      res.headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res;
    }

    // Time-trap: token is required, HMAC-signed, and must be ≥3s old.
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const check = verifyContactToken(token);
    if (!check.ok) {
      const msg =
        check.reason === 'too-fast'
          ? 'That was fast — please take a moment to write your message, then send it again.'
          : 'Your session expired. Please reload the page and try again.';
      return json({ ok: false, error: msg }, 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid request body.' }, 400);
    }
    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
        400,
      );
    }
    const { name, email, subject, message, website } = parsed.data;
    const ipHash = hashIp(ip);

    // Honeypot filled → bot: store as spam, but answer 200 like a success.
    if (website.trim().length > 0) {
      await db.contactMessage.create({
        data: { name, email, subject, message, status: 'spam', ipHash },
      });
      return json({ ok: true });
    }

    await db.contactMessage.create({
      data: { name, email, subject, message, status: 'new', ipHash },
    });
    await maybeSendEmail({ name, email, subject, message });
    return json({ ok: true });
  } catch (err) {
    console.error('[contact] unexpected error:', err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}
