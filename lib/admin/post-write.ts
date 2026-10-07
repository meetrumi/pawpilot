// Shared create/update logic for admin post routes. Server-side only.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { slugify } from '@/lib/format';
import { markdownToSanitizedHtml, postTextStats } from '@/lib/admin/content';
import type { PostWriteInput } from '@/lib/admin/schemas';

export interface PreparedPost {
  data: Prisma.PostCreateInput | Prisma.PostUpdateInput;
  tagIds: string[];
}

/**
 * Validate relations, convert Markdown -> sanitized HTML, recompute
 * wordCount/readingTimeMin/contentText, and resolve tag names to ids
 * (creating missing tags). Throws {status, message}-shaped errors mapped by
 * the route's toErrorResponse via AdminAuthError.
 */
export async function preparePostWrite(
  input: PostWriteInput,
): Promise<PreparedPost> {
  const [category, author] = await Promise.all([
    db.category.findUnique({ where: { id: input.categoryId } }),
    db.author.findUnique({ where: { id: input.authorId } }),
  ]);
  if (!category) {
    throw badRequest('Category not found.');
  }
  if (!author) {
    throw badRequest('Author not found.');
  }

  const contentHtml = markdownToSanitizedHtml(input.markdown);
  const stats = postTextStats(contentHtml);

  const tagRecords = await Promise.all(
    input.tags.map((name) => {
      const slug = slugify(name);
      return db.tag.upsert({
        where: { slug },
        create: { slug, name: name.trim() },
        update: {},
        select: { id: true },
      });
    }),
  );

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
    throw badRequest('scheduledFor is not a valid date.');
  }

  const data = {
    title: input.title,
    slug: input.slug,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    excerpt: input.excerpt,
    contentHtml,
    contentText: stats.contentText,
    wordCount: stats.wordCount,
    readingTimeMin: stats.readingTimeMin,
    status: input.status,
    scheduledFor,
    featuredImageUrl: input.featuredImageUrl,
    featuredImageAlt: input.featuredImageAlt,
    secondaryImageUrl: input.secondaryImageUrl,
    secondaryImageAlt: input.secondaryImageAlt,
    secondaryImageAfterHeading: input.secondaryImageAfterHeading,
    faqJson: input.faq.length > 0 ? JSON.stringify(input.faq) : null,
    keyTakeaways:
      input.keyTakeaways.length > 0 ? JSON.stringify(input.keyTakeaways) : null,
    canonicalUrl: input.canonicalUrl,
    noindex: input.noindex,
    category: { connect: { id: input.categoryId } },
    author: { connect: { id: input.authorId } },
  };

  return { data, tagIds: tagRecords.map((t) => t.id) };
}

/** Attach a 400 status to plain Errors so toErrorResponse maps them correctly. */
export function badRequest(message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = 400;
  return err;
}
