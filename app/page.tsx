import type { Metadata } from 'next';
import Link from 'next/link';
import { PostCard } from '@/components/PostCard';
import { NewsletterForm } from '@/components/NewsletterForm';
import { getCategories, getLatestPosts, getSiteTimezone } from '@/lib/data';
import { buildCanonical } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'PawPilot — Happy pets, confident owners.',
  description:
    'Practical pet-care guides: dog training, cat care, breed guides, pet health basics, honest product reviews, and adventures with pets.',
  alternates: { canonical: buildCanonical('/') },
};

const CATEGORY_ICONS: Record<string, string> = {
  'dog-training': '🦮',
  'cat-care': '🐱',
  'breed-guides': '🐕',
  'pet-health': '🩺',
  'product-reviews': '🧸',
  adventures: '🏕️',
};

export default async function Home() {
  const [posts, categories, timezone] = await Promise.all([
    getLatestPosts(6),
    getCategories(),
    getSiteTimezone(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="py-14 text-center sm:py-20" aria-labelledby="hero-heading">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-800">
          <span aria-hidden="true">🐾</span> Fresh guides every day
        </p>
        <h1
          id="hero-heading"
          className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-ink sm:text-5xl"
        >
          Happy pets, confident owners.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Stop guessing about your pet. Get clear, practical answers on
          training, food, health, and gear — written in plain English for
          real life with real animals.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="#latest"
            className="rounded-xl bg-brand-700 px-6 py-3 text-sm font-bold text-white hover:bg-brand-800"
          >
            Read the latest guides
          </Link>
          <Link
            href="#topics"
            className="rounded-xl border border-ink/15 bg-white px-6 py-3 text-sm font-bold text-ink hover:border-brand-600 hover:text-brand-700"
          >
            Browse topics
          </Link>
        </div>
      </section>

      {/* Latest posts */}
      <section id="latest" aria-labelledby="latest-heading" className="scroll-mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="latest-heading" className="text-2xl font-extrabold tracking-tight text-ink">
            Latest guides
          </h2>
        </div>
        {posts.length > 0 ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} timezone={timezone} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-ink/10 bg-white p-8 text-center text-ink-soft">
            Fresh guides are on the way — check back soon. In the meantime,
            explore our topics below.
          </p>
        )}
      </section>

      {/* Category cards */}
      <section id="topics" aria-labelledby="topics-heading" className="mt-16 scroll-mt-6">
        <h2 id="topics-heading" className="text-2xl font-extrabold tracking-tight text-ink">
          Find answers by topic
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <article
              key={c.slug}
              className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="text-3xl" aria-hidden="true">
                {CATEGORY_ICONS[c.slug] ?? '🐾'}
              </p>
              <h3 className="mt-3 text-lg font-bold text-ink">
                <Link href={`/category/${c.slug}`} className="rounded hover:text-brand-700">
                  {c.name}
                </Link>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {c.description}
              </p>
              <p className="mt-4">
                <Link
                  href={`/category/${c.slug}`}
                  className="text-sm font-bold text-brand-700 underline-offset-4 hover:underline"
                  aria-label={`Browse ${c.name} articles`}
                >
                  Browse articles →
                </Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Trust signals */}
      <section aria-labelledby="trust-heading" className="mt-16 rounded-2xl border border-ink/10 bg-white p-8">
        <h2 id="trust-heading" className="text-xl font-extrabold text-ink">
          Why trust PawPilot?
        </h2>
        <ul className="mt-4 grid gap-4 text-sm leading-relaxed text-ink-soft sm:grid-cols-3">
          <li className="rounded-xl bg-cream p-4">
            <strong className="block text-ink">Written for real owners</strong>
            Every guide answers one question completely, with steps you can use
            the same day — no jargon, no fluff.
          </li>
          <li className="rounded-xl bg-cream p-4">
            <strong className="block text-ink">Health content with a disclaimer</strong>
            Pet health articles are preventive and non-diagnostic, aligned with
            veterinary guidance. Your vet always has the final word.
          </li>
          <li className="rounded-xl bg-cream p-4">
            <strong className="block text-ink">Kept up to date</strong>
            Evergreen guides carry visible publish and update dates, and we
            refresh articles as guidance changes.
          </li>
        </ul>
      </section>

      {/* Newsletter */}
      <section aria-labelledby="newsletter-heading" className="mt-16 rounded-2xl bg-brand-700 p-8 text-white sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="newsletter-heading" className="text-2xl font-extrabold">
            The Weekly Wag — one useful email
          </h2>
          <p className="mt-2 text-brand-100">
            New guides, seasonal pet-care reminders, and the occasional product
            pick. No spam, unsubscribe anytime.
          </p>
          <div className="mt-6 flex justify-center">
            <NewsletterForm source="home" />
          </div>
        </div>
      </section>
    </main>
  );
}
