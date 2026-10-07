import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdSlot } from '@/components/AdSlot';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { JsonLd } from '@/components/JsonLd';
import { NewsletterForm } from '@/components/NewsletterForm';
import { PostCard } from '@/components/PostCard';
import { ShareButtons } from '@/components/ShareButtons';
import { TocNav } from '@/components/TocNav';
import { ViewTracker } from '@/components/ViewTracker';
import {
  extractToc,
  insertSecondaryImage,
  parseFaqJson,
  parseTakeaways,
  splitForMidAd,
} from '@/lib/content';
import {
  getImageDimensions,
  getPostBySlug,
  getPrevNextPosts,
  getRelatedPosts,
  getSiteTimezone,
} from '@/lib/data';
import { formatDate, readingTimeMinutes } from '@/lib/format';
import {
  buildCanonical,
  jsonLdArticle,
  jsonLdBreadcrumb,
  jsonLdFaq,
  siteUrl,
  truncateDescription,
  truncateTitle,
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

function absoluteImage(url: string | null | undefined, site: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${site}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Article not found' };

  const site = siteUrl();
  const title = truncateTitle(post.metaTitle || post.title);
  const description = truncateDescription(post.metaDescription || post.excerpt);
  const canonical = post.canonicalUrl || buildCanonical(`/post/${post.slug}`);
  const image = absoluteImage(post.featuredImageUrl, site) ?? `${site}/post/${post.slug}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: post.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/post/${post.slug}`,
      siteName: 'PawPilot',
      images: [{ url: image, width: 1200, height: 630, alt: post.featuredImageAlt || post.title }],
      publishedTime: post.publishAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      section: post.category.name,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

/**
 * NOTE (Next 16 / Cache Components): `export const dynamicParams`,
 * `export const revalidate = 3600`, and `generateStaticParams() => []` all
 * error the build when cacheComponents is enabled. Dynamic slugs render on
 * demand by default; the data layer caches with `use cache` +
 * `cacheLife('hours')` + tags (Phase C revalidates via revalidateTag).
 */
export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const site = siteUrl();
  const timezone = await getSiteTimezone();
  const canonical = post.canonicalUrl || buildCanonical(`/post/${post.slug}`);

  // TOC: parse H2/H3, inject ids; then place the secondary image.
  const withIds = extractToc(post.contentHtml);
  const withImage = insertSecondaryImage(
    withIds.html,
    post.secondaryImageUrl,
    post.secondaryImageAlt,
    post.secondaryImageAfterHeading,
  );
  const [firstHalf, secondHalf] = splitForMidAd(withImage);

  const faq = parseFaqJson(post.faqJson);
  const takeaways = parseTakeaways(post.keyTakeaways);
  const readingMin =
    post.readingTimeMin > 0 ? post.readingTimeMin : readingTimeMinutes(post.wordCount);

  const [related, prevNext, imageDims] = await Promise.all([
    getRelatedPosts(post.id, post.category.slug, 3),
    post.publishAt ? getPrevNextPosts(post.publishAt, post.id) : Promise.resolve({ newer: null, older: null }),
    post.featuredImageUrl ? getImageDimensions(post.featuredImageUrl) : Promise.resolve(null),
  ]);

  const datePublished = post.publishAt ?? post.updatedAt;
  // Compare calendar days without constructing Date objects (prerender-safe).
  const showUpdated =
    post.publishAt !== null && post.updatedAt.slice(0, 10) !== post.publishAt.slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={jsonLdArticle(
          {
            title: post.title,
            description: truncateDescription(post.metaDescription || post.excerpt),
            slug: post.slug,
            imageUrl: absoluteImage(post.featuredImageUrl, site),
            datePublished,
            dateModified: post.updatedAt,
            authorName: post.author.name,
            authorSlug: post.author.slug,
            authorRole: post.authorFull.role,
            categoryName: post.category.name,
            wordCount: post.wordCount,
          },
          site,
        )}
      />
      <JsonLd
        data={jsonLdBreadcrumb([
          { name: 'Home', url: site },
          { name: post.category.name, url: buildCanonical(`/category/${post.category.slug}`) },
          { name: post.title, url: canonical },
        ])}
      />
      {faq.length > 0 && (
        <JsonLd data={jsonLdFaq(faq.map((f) => ({ q: f.q, a: f.a })))} />
      )}
      <ViewTracker postId={post.id} path={`/post/${post.slug}`} />

      <Breadcrumbs
        items={[
          { name: 'Home', href: '/' },
          { name: post.category.name, href: `/category/${post.category.slug}` },
          { name: post.title },
        ]}
      />

      <article className="mt-6">
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
            <Link
              href={`/category/${post.category.slug}`}
              className="rounded hover:underline"
            >
              {post.category.name}
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">{post.excerpt}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
            <span>
              By{' '}
              <Link
                href={`/author/${post.author.slug}`}
                className="rounded font-bold text-ink underline-offset-4 hover:text-brand-700 hover:underline"
              >
                {post.author.name}
              </Link>
            </span>
            {post.publishAt && (
              <span>
                Published{' '}
                <time dateTime={post.publishAt}>
                  {formatDate(post.publishAt, timezone)}
                </time>
              </span>
            )}
            {showUpdated && post.publishAt && (
              <span>
                Updated{' '}
                <time dateTime={post.updatedAt}>
                  {formatDate(post.updatedAt, timezone)}
                </time>
              </span>
            )}
            <span aria-label={`${readingMin} minute read`}>
              ⏱ {readingMin} min read
            </span>
          </div>

          {/* Affiliate/editorial disclosure above the fold */}
          <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs leading-relaxed text-ink">
            <strong>Disclosure:</strong> This article may contain affiliate
            links. If you buy through them, PawPilot may earn a commission at
            no extra cost to you — it never influences what we recommend.{' '}
            <Link href="/disclaimer" className="font-semibold text-brand-700 underline underline-offset-2">
              Learn more
            </Link>
          </p>
        </header>

        <AdSlot slot="below-title" />

        {post.featuredImageUrl && (
          <figure className="mt-6 max-w-4xl">
            {imageDims ? (
              <Image
                src={post.featuredImageUrl}
                alt={post.featuredImageAlt || post.title}
                width={imageDims.width}
                height={imageDims.height}
                priority
                className="w-full rounded-2xl"
                sizes="(max-width: 1024px) 100vw, 896px"
              />
            ) : (
              <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-2xl bg-brand-50">
                <Image
                  src={post.featuredImageUrl}
                  alt={post.featuredImageAlt || post.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 896px"
                />
              </span>
            )}
            {post.featuredImageAlt && (
              <figcaption className="mt-2 text-center text-sm text-ink-soft">
                {post.featuredImageAlt}
              </figcaption>
            )}
          </figure>
        )}

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            {/* Key takeaways near the top */}
            {takeaways.length > 0 && (
              <section
                aria-labelledby="takeaways-heading"
                className="rounded-2xl border border-brand-200 bg-brand-50 p-6"
              >
                <h2 id="takeaways-heading" className="text-lg font-extrabold text-ink">
                  Key takeaways
                </h2>
                <ul className="mt-3 space-y-2 text-[1.02rem] leading-relaxed text-ink">
                  {takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span aria-hidden="true" className="font-bold text-brand-700">
                        ✓
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Mobile TOC */}
            {withIds.toc.length > 0 && (
              <details className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 lg:hidden">
                <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-ink">
                  On this page
                </summary>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {withIds.toc.map((entry) => (
                    <li key={entry.id} className={entry.level === 3 ? 'ml-4' : ''}>
                      <a
                        href={`#${entry.id}`}
                        className="text-ink-soft underline-offset-4 hover:text-brand-700 hover:underline"
                      >
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div
              className="article-content mt-6"
              dangerouslySetInnerHTML={{ __html: firstHalf }}
            />

            {secondHalf && (
              <>
                <AdSlot slot="mid-article" />
                <div
                  className="article-content mt-6"
                  dangerouslySetInnerHTML={{ __html: secondHalf }}
                />
              </>
            )}

            <AdSlot slot="below-content" />

            {/* FAQ */}
            {faq.length > 0 && (
              <section aria-labelledby="faq-heading" className="mt-10">
                <h2 id="faq-heading" className="text-2xl font-extrabold tracking-tight text-ink">
                  Frequently asked questions
                </h2>
                <div className="mt-4">
                  {faq.map((item, i) => (
                    <details key={i} className="faq-item" open={i === 0}>
                      <summary>{item.q}</summary>
                      <p className="faq-answer">{item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {post.tags.length > 0 && (
              <p className="mt-8 text-sm text-ink-soft">
                <span className="font-bold text-ink">Tagged:</span>{' '}
                {post.tags.join(', ')}
              </p>
            )}

            <div className="mt-8 border-t border-ink/10 pt-6">
              <ShareButtons title={post.title} url={canonical} />
            </div>

            {/* Author box */}
            <section
              aria-labelledby="author-heading"
              className="mt-8 flex gap-5 rounded-2xl border border-ink/10 bg-white p-6"
            >
              {post.authorFull.avatarUrl ? (
                <Image
                  src={post.authorFull.avatarUrl}
                  alt={`Photo of ${post.authorFull.name}`}
                  width={72}
                  height={72}
                  className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-brand-100 text-3xl"
                >
                  🐾
                </span>
              )}
              <div>
                <h2 id="author-heading" className="text-lg font-extrabold text-ink">
                  <Link
                    href={`/author/${post.author.slug}`}
                    className="rounded hover:text-brand-700"
                  >
                    {post.authorFull.name}
                  </Link>
                </h2>
                {post.authorFull.role && (
                  <p className="text-sm font-semibold text-brand-700">{post.authorFull.role}</p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {post.authorFull.bio.length > 220
                    ? `${post.authorFull.bio.slice(0, 220).trimEnd()}…`
                    : post.authorFull.bio}
                </p>
                <p className="mt-2">
                  <Link
                    href={`/author/${post.author.slug}`}
                    className="text-sm font-bold text-brand-700 underline-offset-4 hover:underline"
                  >
                    More from {post.authorFull.name.split(' ')[0]} →
                  </Link>
                </p>
              </div>
            </section>

            {/* Prev / next post nav */}
            {(prevNext.newer || prevNext.older) && (
              <nav aria-label="More articles" className="mt-8 grid gap-4 sm:grid-cols-2">
                {prevNext.older ? (
                  <Link
                    href={`/post/${prevNext.older.slug}`}
                    rel="prev"
                    className="rounded-2xl border border-ink/10 bg-white p-5 hover:border-brand-600"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                      ← Older article
                    </span>
                    <span className="mt-1 block font-bold leading-snug text-ink">
                      {prevNext.older.title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {prevNext.newer && (
                  <Link
                    href={`/post/${prevNext.newer.slug}`}
                    rel="next"
                    className="rounded-2xl border border-ink/10 bg-white p-5 text-right hover:border-brand-600"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Newer article →
                    </span>
                    <span className="mt-1 block font-bold leading-snug text-ink">
                      {prevNext.newer.title}
                    </span>
                  </Link>
                )}
              </nav>
            )}
          </div>

          {/* Sticky desktop TOC */}
          <aside className="hidden lg:block">
            <TocNav toc={withIds.toc} />
          </aside>
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-14">
          <h2 id="related-heading" className="text-2xl font-extrabold tracking-tight text-ink">
            Keep reading
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.id} post={p} timezone={timezone} />
            ))}
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section
        aria-labelledby="post-newsletter-heading"
        className="mt-14 rounded-2xl bg-brand-700 p-8 text-white"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="post-newsletter-heading" className="text-2xl font-extrabold">
            Get the next guide first
          </h2>
          <p className="mt-2 text-brand-100">
            Join The Weekly Wag — practical pet-care tips, one short email a
            week.
          </p>
          <div className="mt-6 flex justify-center">
            <NewsletterForm source="post" />
          </div>
        </div>
      </section>
    </main>
  );
}
