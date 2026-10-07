import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { PostCard } from '@/components/PostCard';
import { getAuthorBySlug, getPostsByAuthor, getSiteTimezone } from '@/lib/data';
import {
  buildCanonical,
  jsonLdBreadcrumb,
  jsonLdPerson,
  siteUrl,
  truncateDescription,
} from '@/lib/seo';

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
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) return { title: 'Author not found' };
  const title = `${author.name} | PawPilot`;
  return {
    title,
    description: truncateDescription(author.bio),
    alternates: { canonical: buildCanonical(`/author/${author.slug}`) },
    openGraph: { title, description: truncateDescription(author.bio), type: 'profile' },
  };
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) notFound();
  const [posts, timezone] = await Promise.all([
    getPostsByAuthor(author.id, 24),
    getSiteTimezone(),
  ]);
  const site = siteUrl();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <JsonLd data={jsonLdPerson(author, site)} />
      <JsonLd
        data={jsonLdBreadcrumb([
          { name: 'Home', url: site },
          { name: author.name, url: buildCanonical(`/author/${author.slug}`) },
        ])}
      />
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: author.name }]} />

      <header className="mt-6 flex max-w-3xl gap-6">
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt={`Photo of ${author.name}`}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand-100 text-4xl"
          >
            🐾
          </span>
        )}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            {author.name}
          </h1>
          {author.role && (
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-brand-700">
              {author.role}
            </p>
          )}
          {author.credentials && (
            <p className="mt-2 text-sm text-ink-soft">{author.credentials}</p>
          )}
        </div>
      </header>

      <section aria-label={`About ${author.name}`} className="mt-6 max-w-3xl">
        <p className="leading-relaxed text-ink">{author.bio}</p>
      </section>

      <section aria-labelledby="author-posts-heading" className="mt-12">
        <h2 id="author-posts-heading" className="text-2xl font-extrabold tracking-tight text-ink">
          Articles by {author.name}
          <span className="ml-2 text-base font-semibold text-ink-soft">
            ({posts.length})
          </span>
        </h2>
        {posts.length > 0 ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} timezone={timezone} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink-soft">
            No articles yet — check back soon.
          </p>
        )}
      </section>
    </main>
  );
}
