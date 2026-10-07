import type { MetadataRoute } from 'next';
import { getCategories, getSitemapPosts } from '@/lib/data';
import { siteUrl } from '@/lib/seo';

// Static pages always present, even if the DB is unreachable.
const STATIC_PAGES = [
  '/',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/disclaimer',
];

/**
 * XML sitemap: posts (with lastmod), categories, static pages.
 * Never includes admin or search routes. Falls back to static pages only
 * when the database is unavailable.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();

  // NOTE: no `new Date()` here — sitemap generation runs at build/prerender
  // time under Cache Components, where current-time calls are forbidden.
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((path) => ({
    url: `${site}${path}`,
    changeFrequency: path === '/' ? 'daily' : 'monthly',
    priority: path === '/' ? 1 : 0.5,
  }));

  try {
    const [posts, categories] = await Promise.all([
      getSitemapPosts(),
      getCategories(),
    ]);
    for (const c of categories) {
      entries.push({
        url: `${site}/category/${c.slug}`,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
    for (const p of posts) {
      entries.push({
        url: `${site}/post/${p.slug}`,
        lastModified: new Date(p.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.9,
      });
    }
  } catch {
    // DB unavailable: serve the static-page fallback sitemap.
  }

  return entries;
}
