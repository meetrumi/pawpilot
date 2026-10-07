// /api/admin/topics — list (GET) and manual add (POST).
//
// The queue is ALWAYS ordered by updatedAt desc. "Move to top" works by
// touching updatedAt (setting it to now), which bubbles the topic to the top
// of every tab. Documented here and in the admin UI.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { topicCreateSchema, topicStatuses } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

const TOPIC_SELECT = {
  id: true,
  keyword: true,
  secondaryKeywords: true,
  searchIntent: true,
  rationale: true,
  status: true,
  source: true,
  runId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.TopicQueueSelect;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false, roles: ['superadmin'] });
    const params = req.nextUrl.searchParams;
    const status = params.get('status');

    const where: Prisma.TopicQueueWhereInput = {};
    if (status && (topicStatuses as readonly string[]).includes(status)) {
      where.status = status;
    }

    const [topics, counts] = await Promise.all([
      db.topicQueue.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 200,
        select: TOPIC_SELECT,
      }),
      db.topicQueue.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const c of counts) countByStatus[c.status] = c._count.status;

    return NextResponse.json({ topics, countByStatus });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = topicCreateSchema.parse(parsed.body);

    if (input.categoryId) {
      const category = await db.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found.' }, { status: 400 });
      }
    }

    const topic = await db.topicQueue.create({
      data: {
        keyword: input.keyword,
        secondaryKeywords: input.secondaryKeywords,
        searchIntent: input.searchIntent,
        rationale: input.rationale,
        scoresJson: '{}',
        status: 'pending',
        source: 'admin',
        categoryId: input.categoryId,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, topic }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
