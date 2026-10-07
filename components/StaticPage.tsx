import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { getPageBySlug, getSiteTimezone } from '@/lib/data';
import { formatDate } from '@/lib/format';
import {
  buildCanonical,
  jsonLdBreadcrumb,
  siteUrl,
  truncateDescription,
  truncateTitle,
} from '@/lib/seo';

/** Metadata for a Page-model static page (about, privacy, terms, …). */
export async function staticPageMetadata(slug: string): Promise<Metadata> {
  const page = await getPageBySlug(slug);
  if (!page) return { title: 'Page not found' };
  return {
    title: truncateTitle(page.metaTitle || page.title),
    description: truncateDescription(page.metaDescription || page.title),
    alternates: { canonical: buildCanonical(`/${slug}`) },
  };
}

/** Render a Page-model static page with breadcrumbs + update date. */
export async function StaticPage({
  slug,
  children,
}: {
  slug: string;
  children?: React.ReactNode;
}) {
  const [page, timezone] = await Promise.all([
    getPageBySlug(slug),
    getSiteTimezone(),
  ]);
  if (!page) notFound();
  const site = siteUrl();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <JsonLd
        data={jsonLdBreadcrumb([
          { name: 'Home', url: site },
          { name: page.title, url: buildCanonical(`/${slug}`) },
        ])}
      />
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: page.title }]} />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {page.title}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Last updated{' '}
        <time dateTime={page.updatedAt}>{formatDate(page.updatedAt, timezone)}</time>
      </p>
      <div
        className="article-content mt-6"
        dangerouslySetInnerHTML={{ __html: page.contentHtml }}
      />
      {children}
    </main>
  );
}
