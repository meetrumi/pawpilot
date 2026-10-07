// /api/admin/posts/[id] — read (GET), update (PUT), delete (DELETE).

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { postWriteSchema } from '@/lib/admin/schemas';
import { preparePostWrite } from '@/lib/admin/post-write';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

const DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  metaTitle: true,
  metaDescription: true,
  excerpt: true,
  contentHtml: true,
  status: true,
  publishAt: true,
  scheduledFor: true,
  featuredImageUrl: true,
  featuredImageAlt: true,
  secondaryImageUrl: true,
  secondaryImageAlt: true,
  secondaryImageAfterHeading: true,
  faqJson: true,
  keyTakeaways: true,
  canonicalUrl: true,
  noindex: true,
  wordCount: true,
  readingTimeMin: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.PostSelect;

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: false });
    const { id } = await params;
    const post = await db.post.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    const existing = await db.post.findUnique({
      where: { id },
      select: { id: true, publishAt: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = postWriteSchema.parse(parsed.body);
    const { data, tagIds } = await preparePostWrite(input);

    const post = await db.post.update({
      where: { id },
      data: {
        ...(data as Prisma.PostUpdateInput),
        // Stamp publishAt the first time a post becomes published.
        publishAt:
          input.status === 'published' && !existing.publishAt
            ? new Date()
            : undefined,
        tags: { set: tagIds.map((tagId) => ({ id: tagId })) },
      },
      select: { id: true, slug: true },
    });
    return NextResponse.json({ ok: true, post });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;
    await db.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
