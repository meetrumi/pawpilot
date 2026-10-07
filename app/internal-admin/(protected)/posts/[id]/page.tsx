// Admin post create/edit page. Server wrapper: loads the post (if editing),
// converts stored HTML -> Markdown for the editor, and hands everything to
// the client PostEditor component.

import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { htmlToMarkdown } from '@/lib/admin/content';
import { PostEditor, type PostFormInitial } from '@/components/admin/post-editor';


type Params = { params: Promise<{ id: string }> };

function blankInitial(categories: Array<{ id: string }>, authors: Array<{ id: string }>): PostFormInitial {
  return {
    title: '',
    slug: '',
    metaTitle: '',
    metaDescription: '',
    excerpt: '',
    markdown: '',
    categoryId: categories[0]?.id ?? '',
    authorId: authors[0]?.id ?? '',
    tags: '',
    status: 'draft',
    scheduledFor: null,
    featuredImageUrl: '',
    featuredImageAlt: '',
    secondaryImageUrl: '',
    secondaryImageAlt: '',
    secondaryImageAfterHeading: '',
    faq: '',
    keyTakeaways: '',
    canonicalUrl: '',
    noindex: false,
  };
}

export default async function AdminPostEditPage({ params }: Params) {
  const { id } = await params;
  const isNew = id === 'new';

  const [categories, authors] = await Promise.all([
    db.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.author.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  let initial: PostFormInitial;
  if (isNew) {
    initial = blankInitial(categories, authors);
  } else {
    const post = await db.post.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        metaTitle: true,
        metaDescription: true,
        excerpt: true,
        contentHtml: true,
        categoryId: true,
        authorId: true,
        tags: { select: { name: true } },
        status: true,
        scheduledFor: true,
        featuredImageUrl: true,
        featuredImageAlt: true,
        secondaryImageUrl: true,
        secondaryImageAlt: true,
        secondaryImageAfterHeading: true,
        faqJson: true,
        keyTakeaways: true,
        canonicalUrl: true,
        noindex: true,
      },
    });
    if (!post) notFound();

    let takeaways = '';
    if (post.keyTakeaways) {
      try {
        const arr: unknown = JSON.parse(post.keyTakeaways);
        if (Array.isArray(arr)) takeaways = arr.filter((x) => typeof x === 'string').join('\n');
      } catch {
        takeaways = '';
      }
    }

    initial = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      excerpt: post.excerpt,
      markdown: htmlToMarkdown(post.contentHtml),
      categoryId: post.categoryId,
      authorId: post.authorId,
      tags: post.tags.map((t) => t.name).join(', '),
      status: post.status as PostFormInitial['status'],
      scheduledFor: post.scheduledFor ? post.scheduledFor.toISOString() : null,
      featuredImageUrl: post.featuredImageUrl ?? '',
      featuredImageAlt: post.featuredImageAlt ?? '',
      secondaryImageUrl: post.secondaryImageUrl ?? '',
      secondaryImageAlt: post.secondaryImageAlt ?? '',
      secondaryImageAfterHeading: post.secondaryImageAfterHeading ?? '',
      faq: post.faqJson ?? '',
      keyTakeaways: takeaways,
      canonicalUrl: post.canonicalUrl ?? '',
      noindex: post.noindex,
    };
  }

  return (
    <PostEditor
      initial={initial}
      isNew={isNew}
      categories={categories}
      authors={authors}
    />
  );
}
