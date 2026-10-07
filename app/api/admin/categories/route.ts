// /api/admin/categories — list (GET) and create (POST).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { categoryWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true, topics: true } } },
    });
    return NextResponse.json({ categories });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = categoryWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    const category = await db.category.create({
      data: { name: input.name, slug, description: input.description },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
