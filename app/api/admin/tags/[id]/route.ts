// /api/admin/tags/[id] — update (PUT), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { tagWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    const existing = await db.tag.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });
    }
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = tagWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    const taken = await db.tag.findFirst({
      where: { slug, id: { not: id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: 'That slug is already used by another tag.' }, { status: 409 });
    }
    const tag = await db.tag.update({
      where: { id },
      data: { name: input.name, slug },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ ok: true, tag });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    await db.tag.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
