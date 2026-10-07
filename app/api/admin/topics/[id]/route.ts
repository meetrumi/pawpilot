// /api/admin/topics/[id] — approve/reject/move-to-top (PATCH), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { topicPatchSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = topicPatchSchema.parse(parsed.body);

    const existing = await db.topicQueue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    }

    if (input.action === 'move-top') {
      // Touch updatedAt: the queue is ordered by updatedAt desc, so this
      // moves the topic to the top of its tab.
      const topic = await db.topicQueue.update({
        where: { id },
        data: { updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });
      return NextResponse.json({ ok: true, topic });
    }

    const status =
      input.status ??
      (input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : null);
    if (!status) {
      return NextResponse.json({ error: 'Provide an action or a status.' }, { status: 400 });
    }
    const topic = await db.topicQueue.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, topic });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const { id } = await params;
    await db.topicQueue.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
