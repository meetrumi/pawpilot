import { z } from 'zod';
import { db } from '@/lib/db';
import { getClientIp, hashIp } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';

const ViewSchema = z.object({
  postId: z.string().min(1).max(64),
  path: z.string().min(1).max(500),
});

/** Pageview ping (navigator.sendBeacon from post pages). Rate-limited. */
export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`view:${ip}`, 60, 10 * 60 * 1000);
    if (!allowed) {
      return new Response(null, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = ViewSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(null, { status: 400 });
    }
    const { postId, path } = parsed.data;

    // Only record views for real published posts.
    const post = await db.post.findFirst({
      where: { id: postId, status: 'published' },
      select: { id: true },
    });
    if (!post) {
      return new Response(null, { status: 404 });
    }

    await db.pageView.create({
      data: { path, postId: post.id, ipHash: hashIp(ip) },
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[view] unexpected error:', err);
    return new Response(null, { status: 500 });
  }
}
