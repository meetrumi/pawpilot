// Admin posts list: status/category filter + search (plain GET form, no JS).

import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { adminBasePath } from '@/lib/auth';
import { postStatuses } from '@/lib/admin/schemas';
import { Badge, PageHeader, EmptyState, inputClass, btnPrimary } from '@/components/admin/ui';


interface SearchParams {
  status?: string;
  categoryId?: string;
  q?: string;
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const basePath = adminBasePath();
  const sp = await searchParams;
  const status = sp.status ?? '';
  const categoryId = sp.categoryId ?? '';
  const q = (sp.q ?? '').trim();

  const where: Prisma.PostWhereInput = {};
  if (status && (postStatuses as readonly string[]).includes(status)) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [posts, total, categories] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishAt: true,
        scheduledFor: true,
        wordCount: true,
        updatedAt: true,
        category: { select: { name: true } },
        author: { select: { name: true } },
      },
    }),
    db.post.count({ where }),
    db.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Posts"
        subtitle={`${total} post${total === 1 ? '' : 's'} match the current filters.`}
        actions={
          <Link href={`${basePath}/posts/new`} className={btnPrimary}>
            + New post
          </Link>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Status
          </span>
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="">All</option>
            {postStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Category
          </span>
          <select name="categoryId" defaultValue={categoryId} className={inputClass}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-52 flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Search
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Title or slug…"
            className={inputClass}
          />
        </label>
        <button type="submit" className={btnPrimary}>
          Filter
        </button>
        {(status || categoryId || q) && (
          <Link
            href={`${basePath}/posts`}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-stone-50"
          >
            Clear
          </Link>
        )}
      </form>

      {posts.length === 0 ? (
        <EmptyState message="No posts found. Adjust the filters or create a new post." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Author</th>
                <th className="px-4 py-3 font-semibold">Words</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`${basePath}/posts/${p.id}`}
                      className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                    >
                      {p.title}
                    </Link>
                    <div className="font-mono text-xs text-ink-soft">/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={p.status} />
                    {p.status === 'scheduled' && p.scheduledFor && (
                      <div className="mt-1 text-xs text-ink-soft">
                        {p.scheduledFor.toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{p.category.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.author.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.wordCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-soft">
                    {p.updatedAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
