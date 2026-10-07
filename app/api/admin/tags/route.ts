// /api/admin/tags — list (GET) and create (POST).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { tagWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false, roles: ['superadmin'] });
    const tags = await db.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return NextResponse.json({ tags });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = tagWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    const tag = await db.tag.create({
      data: { name: input.name, slug },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ ok: true, tag }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
