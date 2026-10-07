// /api/admin/inbox — contact messages list (GET) with status filter + counts.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

const STATUSES = ['new', 'read', 'replied', 'spam'] as const;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const params = req.nextUrl.searchParams;
    const status = params.get('status');

    const where: Prisma.ContactMessageWhereInput = {};
    if (status && (STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }

    const [messages, counts] = await Promise.all([
      db.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.contactMessage.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const c of counts) countByStatus[c.status] = c._count.status;

    return NextResponse.json({ messages, countByStatus });
  } catch (err) {
    return toErrorResponse(err);
  }
}
