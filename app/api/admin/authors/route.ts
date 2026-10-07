// /api/admin/authors — list (GET) and create (POST).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { authorWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const authors = await db.author.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return NextResponse.json({ authors });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = authorWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    const author = await db.author.create({
      data: {
        name: input.name,
        slug,
        bio: input.bio,
        role: input.role,
        credentials: input.credentials,
        email: input.email,
        avatarUrl: input.avatarUrl,
      },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ ok: true, author }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
