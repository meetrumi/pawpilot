import { getLatestPosts } from '@/lib/data';
import { buildCanonical, siteUrl, truncateDescription } from '@/lib/seo';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS 2.0 feed: 20 latest published posts. */
export async function GET(): Promise<Response> {
  const site = siteUrl();
  // getLatestPosts already degrades to [] when the DB is unreachable,
  // and an empty channel is still valid RSS.
  const posts = await getLatestPosts(20);

  const items = posts
    .map((p) => {
      const url = buildCanonical(`/post/${p.slug}`);
      const pubDate = p.publishAt ? new Date(p.publishAt).toUTCString() : new Date(p.updatedAt).toUTCString();
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(truncateDescription(p.excerpt))}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(p.category.name)}</category>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PawPilot — Happy pets, confident owners.</title>
    <link>${escapeXml(site)}</link>
    <description>Practical pet-care guides: dog training, cat care, breed guides, pet health basics, honest product reviews, and adventures with pets.</description>
    <language>en</language>
    <atom:link href="${escapeXml(`${site}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
