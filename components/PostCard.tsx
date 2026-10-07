import Image from 'next/image';
import Link from 'next/link';
import type { PostSummaryDto } from '@/lib/data';
import { formatDate } from '@/lib/format';

/** Article card used in grids (home, category, author, related). */
export function PostCard({ post, timezone }: { post: PostSummaryDto; timezone: string }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm transition-shadow hover:shadow-md">
      {post.featuredImageUrl && (
        <Link
          href={`/post/${post.slug}`}
          className="relative block aspect-[16/9] w-full overflow-hidden bg-brand-50"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Image
            src={post.featuredImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            loading="lazy"
          />
        </Link>
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
          <Link href={`/category/${post.category.slug}`} className="rounded hover:underline">
            {post.category.name}
          </Link>
        </p>
        <h3 className="mt-2 text-lg font-bold leading-snug text-ink">
          <Link href={`/post/${post.slug}`} className="rounded hover:text-brand-700">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-soft">
          {post.excerpt}
        </p>
        <p className="mt-4 text-xs text-ink-soft">
          {post.author.name}
          {post.publishAt && (
            <>
              {' · '}
              <time dateTime={post.publishAt}>
                {formatDate(post.publishAt, timezone)}
              </time>
            </>
          )}
          {post.readingTimeMin > 0 && ` · ${post.readingTimeMin} min read`}
        </p>
      </div>
    </article>
  );
}
