// /api/admin/authors/[id] — update (PUT), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { authorWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    const existing = await db.author.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Author not found.' }, { status: 404 });
    }
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = authorWriteSchema.parse(parsed.body);
    const slug = input.slug || slugify(input.name);
    if (!slug) {
      return NextResponse.json({ error: 'Could not derive a slug from the name.' }, { status: 400 });
    }
    const taken = await db.author.findFirst({
      where: { slug, id: { not: id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: 'That slug is already used by another author.' }, { status: 409 });
    }
    const author = await db.author.update({
      where: { id },
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
    return NextResponse.json({ ok: true, author });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    await db.author.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
