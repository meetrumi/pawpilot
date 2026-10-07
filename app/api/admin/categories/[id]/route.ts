// /api/admin/categories/[id] — update (PUT), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { categoryWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

async function slugTaken(slug: string, excludeId: string): Promise<boolean> {
  const row = await db.category.findFirst({
    where: { slug, id: { not: excludeId } },
    select: { id: true },
  });
  return row !== null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    const existing = await db.category.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = categoryWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    if (await slugTaken(slug, id)) {
      return NextResponse.json({ error: 'That slug is already used by another category.' }, { status: 409 });
    }
    const category = await db.category.update({
      where: { id },
      data: { name: input.name, slug, description: input.description },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ ok: true, category });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    await db.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
