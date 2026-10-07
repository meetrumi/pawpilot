// /api/admin/inbox/[id] — change status (PATCH), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inboxPatchSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = inboxPatchSchema.parse(parsed.body);

    const message = await db.contactMessage.update({
      where: { id },
      data: { status: input.status },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    await db.contactMessage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
