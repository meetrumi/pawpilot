// /api/admin/posts — list (GET) and create (POST).

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { postStatuses, postWriteSchema } from '@/lib/admin/schemas';
import { preparePostWrite } from '@/lib/admin/post-write';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  publishAt: true,
  scheduledFor: true,
  wordCount: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
} satisfies Prisma.PostSelect;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const params = req.nextUrl.searchParams;
    const status = params.get('status');
    const categoryId = params.get('categoryId');
    const q = params.get('q')?.trim();
    const take = Math.min(
      Math.max(Number.parseInt(params.get('take') ?? '50', 10) || 50, 1),
      200,
    );

    const where: Prisma.PostWhereInput = {};
    if (status && (postStatuses as readonly string[]).includes(status)) {
      where.status = status;
    }
    if (categoryId) where.categoryId = categoryId;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        select: LIST_SELECT,
      }),
      db.post.count({ where }),
    ]);
    return NextResponse.json({ posts, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = postWriteSchema.parse(parsed.body);
    const { data, tagIds } = await preparePostWrite(input);

    const post = await db.post.create({
      data: {
        ...(data as Prisma.PostCreateInput),
        // First publish: stamp publishAt when a post is created as published.
        publishAt: input.status === 'published' ? new Date() : null,
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
      select: { id: true, slug: true },
    });
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
