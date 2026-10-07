// PawPilot public-site data layer (Phase B).
//
// Build-safe: every Prisma call is wrapped in try/catch and returns a
// graceful fallback ([] / null), so `next build` and page renders never
// crash when the database is unreachable — pages render empty states.
//
// Caching (Next 16 Cache Components): each reader uses `use cache` +
// `cacheLife('hours')` — the Cache Components equivalent of the old
// `export const revalidate = 3600` (route-segment `revalidate` errors the
// build when cacheComponents is enabled). Cache tags let Phase C call
// `revalidateTag('posts')` etc. on publish for instant freshness.
//
// NOTE: never query the DB at module top-level; only inside functions.

import { cacheLife, cacheTag } from 'next/cache';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { getSetting } from './settings';

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface AuthorDto {
  id: string;
  slug: string;
  name: string;
  bio: string;
  role: string | null;
  credentials: string | null;
  avatarUrl: string | null;
}

export interface PostSummaryDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  publishAt: string | null; // ISO
  updatedAt: string; // ISO
  readingTimeMin: number;
  category: { slug: string; name: string };
  author: { slug: string; name: string };
}

export interface PostDetailDto extends PostSummaryDto {
  metaTitle: string;
  metaDescription: string;
  contentHtml: string;
  secondaryImageUrl: string | null;
  secondaryImageAlt: string | null;
  secondaryImageAfterHeading: string | null;
  faqJson: string | null;
  keyTakeaways: string | null;
  wordCount: number;
  canonicalUrl: string | null;
  noindex: boolean;
  authorFull: AuthorDto;
  tags: string[];
}

export interface PageDto {
  slug: string;
  title: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  updatedAt: string; // ISO
}

export interface SearchResultDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishAt: string | null;
  rank: number;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function publishedFilter() {
  return { status: 'published', publishAt: { lte: new Date() } };
}

/** Latest published posts (home, RSS). */
export async function getLatestPosts(limit: number): Promise<PostSummaryDto[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const posts = await db.post.findMany({
      where: publishedFilter(),
      orderBy: { publishAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        featuredImageUrl: true,
        featuredImageAlt: true,
        publishAt: true,
        updatedAt: true,
        readingTimeMin: true,
        category: { select: { slug: true, name: true } },
        author: { select: { slug: true, name: true } },
      },
    });
    return posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      featuredImageUrl: p.featuredImageUrl,
      featuredImageAlt: p.featuredImageAlt,
      publishAt: iso(p.publishAt),
      updatedAt: p.updatedAt.toISOString(),
      readingTimeMin: p.readingTimeMin,
      category: p.category,
      author: p.author,
    }));
  } catch {
    return [];
  }
}

/** Total published post count (pagination). */
export async function countPublishedPosts(): Promise<number> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    return await db.post.count({ where: publishedFilter() });
  } catch {
    return 0;
  }
}

/** All categories, alphabetical. */
export async function getCategories(): Promise<CategoryDto[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('categories');
  try {
    const rows = await db.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, description: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDto | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('categories');
  try {
    const row = await db.category.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, description: true },
    });
    return row;
  } catch {
    return null;
  }
}

export interface CategoryPageData {
  category: CategoryDto;
  posts: PostSummaryDto[];
  total: number;
}

/** Paginated published posts for a category. */
export async function getCategoryPage(
  slug: string,
  page: number,
  perPage: number,
): Promise<CategoryPageData | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts', 'categories');
  try {
    const category = await db.category.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, description: true },
    });
    if (!category) return null;
    const where = { ...publishedFilter(), categoryId: category.id };
    const [total, posts] = await Promise.all([
      db.post.count({ where }),
      db.post.findMany({
        where,
        orderBy: { publishAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          featuredImageUrl: true,
          featuredImageAlt: true,
          publishAt: true,
          updatedAt: true,
          readingTimeMin: true,
          category: { select: { slug: true, name: true } },
          author: { select: { slug: true, name: true } },
        },
      }),
    ]);
    return {
      category,
      total,
      posts: posts.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        featuredImageUrl: p.featuredImageUrl,
        featuredImageAlt: p.featuredImageAlt,
        publishAt: iso(p.publishAt),
        updatedAt: p.updatedAt.toISOString(),
        readingTimeMin: p.readingTimeMin,
        category: p.category,
        author: p.author,
      })),
    };
  } catch {
    return null;
  }
}

/** Full published post by slug (null when missing, draft, or DB down). */
export async function getPostBySlug(slug: string): Promise<PostDetailDto | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const p = await db.post.findFirst({
      where: { slug, ...publishedFilter() },
      select: {
        id: true,
        slug: true,
        title: true,
        metaTitle: true,
        metaDescription: true,
        excerpt: true,
        contentHtml: true,
        featuredImageUrl: true,
        featuredImageAlt: true,
        secondaryImageUrl: true,
        secondaryImageAlt: true,
        secondaryImageAfterHeading: true,
        faqJson: true,
        keyTakeaways: true,
        wordCount: true,
        readingTimeMin: true,
        canonicalUrl: true,
        noindex: true,
        publishAt: true,
        updatedAt: true,
        category: { select: { slug: true, name: true } },
        author: {
          select: {
            id: true,
            slug: true,
            name: true,
            bio: true,
            role: true,
            credentials: true,
            avatarUrl: true,
          },
        },
        tags: { select: { name: true } },
      },
    });
    if (!p) return null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      excerpt: p.excerpt,
      contentHtml: p.contentHtml,
      featuredImageUrl: p.featuredImageUrl,
      featuredImageAlt: p.featuredImageAlt,
      secondaryImageUrl: p.secondaryImageUrl,
      secondaryImageAlt: p.secondaryImageAlt,
      secondaryImageAfterHeading: p.secondaryImageAfterHeading,
      faqJson: p.faqJson,
      keyTakeaways: p.keyTakeaways,
      wordCount: p.wordCount,
      readingTimeMin: p.readingTimeMin,
      canonicalUrl: p.canonicalUrl,
      noindex: p.noindex,
      publishAt: iso(p.publishAt),
      updatedAt: p.updatedAt.toISOString(),
      category: p.category,
      author: { slug: p.author.slug, name: p.author.name },
      authorFull: {
        id: p.author.id,
        slug: p.author.slug,
        name: p.author.name,
        bio: p.author.bio,
        role: p.author.role,
        credentials: p.author.credentials,
        avatarUrl: p.author.avatarUrl,
      },
      tags: p.tags.map((t) => t.name),
    };
  } catch {
    return null;
  }
}

/** 3 related published posts: same category, newest first, excluding self. */
export async function getRelatedPosts(
  postId: string,
  categorySlug: string,
  limit = 3,
): Promise<PostSummaryDto[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const category = await db.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true },
    });
    if (!category) return [];
    const posts = await db.post.findMany({
      where: { ...publishedFilter(), categoryId: category.id, id: { not: postId } },
      orderBy: { publishAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        featuredImageUrl: true,
        featuredImageAlt: true,
        publishAt: true,
        updatedAt: true,
        readingTimeMin: true,
        category: { select: { slug: true, name: true } },
        author: { select: { slug: true, name: true } },
      },
    });
    return posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      featuredImageUrl: p.featuredImageUrl,
      featuredImageAlt: p.featuredImageAlt,
      publishAt: iso(p.publishAt),
      updatedAt: p.updatedAt.toISOString(),
      readingTimeMin: p.readingTimeMin,
      category: p.category,
      author: p.author,
    }));
  } catch {
    return [];
  }
}

export interface PrevNextPosts {
  newer: PostSummaryDto | null;
  older: PostSummaryDto | null;
}

const prevNextSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  featuredImageUrl: true,
  featuredImageAlt: true,
  publishAt: true,
  updatedAt: true,
  readingTimeMin: true,
  category: { select: { slug: true, name: true } },
  author: { select: { slug: true, name: true } },
} as const;

function toSummary(p: {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  publishAt: Date | null;
  updatedAt: Date;
  readingTimeMin: number;
  category: { slug: string; name: string };
  author: { slug: string; name: string };
}): PostSummaryDto {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    featuredImageUrl: p.featuredImageUrl,
    featuredImageAlt: p.featuredImageAlt,
    publishAt: iso(p.publishAt),
    updatedAt: p.updatedAt.toISOString(),
    readingTimeMin: p.readingTimeMin,
    category: p.category,
    author: p.author,
  };
}

/** Chronological neighbors of a post for prev/next navigation. */
export async function getPrevNextPosts(
  publishAtIso: string,
  excludeId: string,
): Promise<PrevNextPosts> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const publishAt = new Date(publishAtIso);
    const [newer, older] = await Promise.all([
      db.post.findFirst({
        where: { ...publishedFilter(), publishAt: { gt: publishAt }, id: { not: excludeId } },
        orderBy: { publishAt: 'asc' },
        select: prevNextSelect,
      }),
      db.post.findFirst({
        where: { ...publishedFilter(), publishAt: { lt: publishAt }, id: { not: excludeId } },
        orderBy: { publishAt: 'desc' },
        select: prevNextSelect,
      }),
    ]);
    return {
      newer: newer ? toSummary(newer) : null,
      older: older ? toSummary(older) : null,
    };
  } catch {
    return { newer: null, older: null };
  }
}

/** Author profile by slug (null when missing or DB down). */
export async function getAuthorBySlug(slug: string): Promise<AuthorDto | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('authors');
  try {
    const row = await db.author.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        bio: true,
        role: true,
        credentials: true,
        avatarUrl: true,
      },
    });
    return row;
  } catch {
    return null;
  }
}

/** Published posts by an author, newest first. */
export async function getPostsByAuthor(
  authorId: string,
  limit = 20,
): Promise<PostSummaryDto[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts', 'authors');
  try {
    const posts = await db.post.findMany({
      where: { ...publishedFilter(), authorId },
      orderBy: { publishAt: 'desc' },
      take: limit,
      select: prevNextSelect,
    });
    return posts.map(toSummary);
  } catch {
    return [];
  }
}

/** Static content page by slug (about, privacy, terms, disclaimer, contact). */
export async function getPageBySlug(slug: string): Promise<PageDto | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('pages');
  try {
    const row = await db.page.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        contentHtml: true,
        metaTitle: true,
        metaDescription: true,
        updatedAt: true,
      },
    });
    if (!row) return null;
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  } catch {
    return null;
  }
}

export interface SitemapPost {
  slug: string;
  updatedAt: string; // ISO
}

/** All published post slugs + lastmod for the sitemap. */
export async function getSitemapPosts(): Promise<SitemapPost[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const rows = await db.post.findMany({
      where: publishedFilter(),
      orderBy: { publishAt: 'desc' },
      select: { slug: true, updatedAt: true },
    });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  } catch {
    return [];
  }
}

/**
 * Full-text search over published posts using the `post_search_gin`
 * expression index (to_tsvector('english', title || ' ' || contentText)).
 * Raw SQL so the query matches the index expression exactly.
 */
export async function searchPosts(
  query: string,
  limit = 20,
): Promise<SearchResultDto[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  const q = query.trim();
  if (!q) return [];
  try {
    const rows = await db.$queryRaw<
      Array<{
        id: string;
        slug: string;
        title: string;
        excerpt: string;
        publishAt: Date | null;
        rank: number;
      }>
    >(Prisma.sql`
      SELECT "id", "slug", "title", "excerpt", "publishAt",
        ts_rank(
          to_tsvector('english', "title" || ' ' || "contentText"),
          websearch_to_tsquery('english', ${q})
        ) AS rank
      FROM "Post"
      WHERE "status" = 'published'
        AND "publishAt" <= NOW()
        AND to_tsvector('english', "title" || ' ' || "contentText")
            @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${Math.max(1, Math.min(50, limit))}
    `);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      publishAt: iso(r.publishAt),
      rank: Number(r.rank),
    }));
  } catch {
    return [];
  }
}

/** Site display timezone (agent config), defaulting to Asia/Karachi. */
export async function getSiteTimezone(): Promise<string> {
  'use cache';
  cacheLife('hours');
  cacheTag('settings');
  try {
    const tz = await getSetting('timezone', 'Asia/Karachi');
    return tz || 'Asia/Karachi';
  } catch {
    return 'Asia/Karachi';
  }
}

export interface AdsSettings {
  enabled: boolean;
  clientId: string;
}

/** Ad display settings; ads are disabled unless explicitly enabled. */
export async function getAdsSettings(): Promise<AdsSettings> {
  'use cache';
  cacheLife('hours');
  cacheTag('settings');
  try {
    const [enabledRaw, clientId] = await Promise.all([
      getSetting('ads_enabled', 'false'),
      getSetting('adsense_client_id', ''),
    ]);
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      enabledRaw.trim().toLowerCase(),
    );
    return { enabled, clientId: clientId.trim() };
  } catch {
    return { enabled: false, clientId: '' };
  }
}

/** Look up stored dimensions for an image URL (Media library). */
export async function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  try {
    const row = await db.media.findFirst({
      where: { url },
      select: { width: true, height: true },
    });
    if (row?.width && row?.height) {
      return { width: row.width, height: row.height };
    }
    return null;
  } catch {
    return null;
  }
}
