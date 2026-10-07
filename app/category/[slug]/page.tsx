import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Pagination } from '@/components/Pagination';
import { PostCard } from '@/components/PostCard';
import { JsonLd } from '@/components/JsonLd';
import { getCategoryPage, getSiteTimezone } from '@/lib/data';
import {
  buildCanonical,
  jsonLdBreadcrumb,
  siteUrl,
  truncateDescription,
} from '@/lib/seo';

const PER_PAGE = 12;

/**
 * Cache Components note: this route awaits params/searchParams (request-time
 * data) outside <Suspense>. `instant = false` marks the segment as allowed
 * to block — the documented replacement for on-demand ISR here. Data is
 * still cached hourly via `use cache` + `cacheLife('hours')` in lib/data.ts
 * (with cache tags for on-demand revalidation on publish).
 */
export const instant = false;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function pagePath(slug: string, page: number): string {
  return page <= 1 ? `/category/${slug}` : `/category/${slug}?page=${page}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
  const data = await getCategoryPage(slug, 1, 1);
  if (!data) return { title: 'Category not found' };
  const { category, total } = data;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const title =
    page > 1
      ? `${category.name} — Page ${page} | PawPilot`
      : `${category.name} | PawPilot`;
  return {
    title,
    description: truncateDescription(
      page > 1
        ? `${category.description} (page ${page} of ${totalPages})`
        : category.description,
    ),
    alternates: { canonical: buildCanonical(pagePath(slug, page)) },
    openGraph: {
      title,
      description: truncateDescription(category.description),
      url: pagePath(slug, page),
      type: 'website',
    },
  };
}

/**
 * NOTE (Next 16 / Cache Components): the old route-segment configs
 * `export const dynamicParams`, `export const revalidate = 3600`, and
 * `generateStaticParams() => []` all error the build when cacheComponents is
 * enabled. The equivalents are in use: dynamic params render on demand by
 * default, and the data layer (lib/data.ts) caches with `use cache` +
 * `cacheLife('hours')` + cache tags for on-demand revalidation.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);

  const data = await getCategoryPage(slug, page, PER_PAGE);
  if (!data) notFound();
  const { category, posts, total } = data;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > totalPages) notFound();

  const timezone = await getSiteTimezone();
  const site = siteUrl();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* React 19 hoists these <link> tags into <head>. */}
      {page > 1 && (
        <link rel="prev" href={buildCanonical(pagePath(slug, page - 1))} />
      )}
      {page < totalPages && (
        <link rel="next" href={buildCanonical(pagePath(slug, page + 1))} />
      )}
      <JsonLd
        data={jsonLdBreadcrumb([
          { name: 'Home', url: site },
          { name: category.name, url: buildCanonical(`/category/${slug}`) },
        ])}
      />

      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: category.name },
        ]}
      />
      <header className="mt-4 max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {category.name}
          {page > 1 && (
            <span className="text-ink-soft"> — Page {page}</span>
          )}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-soft">{category.description}</p>
        <p className="mt-2 text-sm text-ink-soft">
          {total} {total === 1 ? 'article' : 'articles'}
          {totalPages > 1 && ` · page ${page} of ${totalPages}`}
        </p>
      </header>

      {posts.length > 0 ? (
        <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} timezone={timezone} />
            ))}
          </div>
          <Pagination
            basePath={`/category/${slug}`}
            page={page}
            totalPages={totalPages}
          />
        </>
      ) : (
        <p className="mt-8 rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink-soft">
          No articles here yet — new {category.name.toLowerCase()} guides are
          published regularly. Check back soon.
        </p>
      )}
    </main>
  );
}
