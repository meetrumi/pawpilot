import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getClientIp } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';

const NewsletterSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase().max(254),
  source: z.string().trim().max(50).optional().default('site'),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`newsletter:${ip}`, 10, 10 * 60 * 1000);
    if (!allowed) {
      return Response.json(
        { ok: false, error: 'Too many signups. Please try again later.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
    }
    const parsed = NewsletterSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' },
        { status: 400 },
      );
    }
    const { email, source } = parsed.data;

    const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ ok: true, message: 'You are already subscribed. 🐾' });
    }
    try {
      await db.newsletterSubscriber.create({
        data: { email, source, status: 'active' },
      });
    } catch (err) {
      // Race: another request subscribed this email first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return Response.json({ ok: true, message: 'You are already subscribed. 🐾' });
      }
      throw err;
    }
    return Response.json({ ok: true, message: 'Welcome aboard! Please check your inbox.' });
  } catch (err) {
    console.error('[newsletter] unexpected error:', err);
    return Response.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
