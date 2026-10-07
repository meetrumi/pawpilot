'use client';

// Admin post editor: Markdown editing via @uiw/react-md-editor, live HTML
// preview (marked -> sanitize-html, same pipeline as the server save path),
// slug auto-suggest, SEO char counters, media-library picker, and delete.

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { slugify } from '@/lib/format';
import { markdownToSanitizedHtml } from '@/lib/admin/content';
import { postStatuses } from '@/lib/admin/schemas';
import { AdminApiError, useAdmin, useAdminFetch } from './admin-context';
import {
  Badge,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorAlert,
  Field,
  PageHeader,
  SuccessAlert,
  btnDanger,
  btnPrimary,
  btnSecondary,
  inputClass,
} from './ui';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export type PostStatus = (typeof postStatuses)[number];

export interface PostFormInitial {
  id?: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  markdown: string;
  categoryId: string;
  authorId: string;
  tags: string;
  status: PostStatus;
  scheduledFor: string | null;
  featuredImageUrl: string;
  featuredImageAlt: string;
  secondaryImageUrl: string;
  secondaryImageAlt: string;
  secondaryImageAfterHeading: string;
  faq: string;
  keyTakeaways: string;
  canonicalUrl: string;
  noindex: boolean;
}

/** UTC ISO -> datetime-local input value. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value -> UTC ISO (local -> UTC). */
function fromLocalInput(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface MediaItem {
  id: string;
  url: string;
  alt: string | null;
}

function MediaPicker({
  onPick,
  onClose,
}: {
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const adminFetch = useAdminFetch();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/media')
      .then((d) => {
        if (!cancelled) setItems((d as { media: MediaItem[] }).media);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load media.');
      });
    return () => {
      cancelled = true;
    };
  }, [adminFetch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Choose image">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Choose from media library</h2>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Close
          </button>
        </div>
        <ErrorAlert message={error} />
        {items === null ? (
          <p className="py-8 text-center text-sm text-ink-soft">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState message="No media yet. Upload images from the Media page first." />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick(m);
                  onClose();
                }}
                className="group overflow-hidden rounded-lg border border-stone-200 text-left hover:border-brand-500"
                title={m.alt ?? m.url}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt ?? ''} className="aspect-square w-full object-cover" loading="lazy" />
                <div className="truncate px-2 py-1 text-xs text-ink-soft group-hover:text-brand-700">
                  Use this →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PostEditor({
  initial,
  isNew,
  categories,
  authors,
}: {
  initial: PostFormInitial;
  isNew: boolean;
  categories: Array<{ id: string; name: string }>;
  authors: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { basePath } = useAdmin();
  const adminFetch = useAdminFetch();

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [metaTitle, setMetaTitle] = useState(initial.metaTitle);
  const [metaDescription, setMetaDescription] = useState(initial.metaDescription);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [authorId, setAuthorId] = useState(initial.authorId);
  const [tagsInput, setTagsInput] = useState(initial.tags);
  const [status, setStatus] = useState<PostStatus>(initial.status);
  const [scheduledLocal, setScheduledLocal] = useState(toLocalInput(initial.scheduledFor));
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initial.featuredImageUrl);
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initial.featuredImageAlt);
  const [secondaryImageUrl, setSecondaryImageUrl] = useState(initial.secondaryImageUrl);
  const [secondaryImageAlt, setSecondaryImageAlt] = useState(initial.secondaryImageAlt);
  const [secondaryAfterHeading, setSecondaryAfterHeading] = useState(initial.secondaryImageAfterHeading);
  const [faqText, setFaqText] = useState(initial.faq);
  const [takeawaysText, setTakeawaysText] = useState(initial.keyTakeaways);
  const [canonicalUrl, setCanonicalUrl] = useState(initial.canonicalUrl);
  const [noindex, setNoindex] = useState(initial.noindex);

  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [pickerFor, setPickerFor] = useState<'featured' | 'secondary' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const previewHtml = useMemo(
    () => (tab === 'preview' ? markdownToSanitizedHtml(markdown) : ''),
    [tab, markdown],
  );

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function validateFaq(): { ok: true; value: Array<{ q: string; a: string }> } | { ok: false; message: string } {
    const raw = faqText.trim();
    if (!raw) return { ok: true, value: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: 'FAQ is not valid JSON. Expected an array like [{"q":"…","a":"…"}].' };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'FAQ must be a JSON array of {"q","a"} objects.' };
    }
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as { q?: unknown }).q !== 'string' ||
        typeof (item as { a?: unknown }).a !== 'string' ||
        !(item as { q: string }).q.trim() ||
        !(item as { a: string }).a.trim()
      ) {
        return { ok: false, message: 'Each FAQ entry must be an object with non-empty "q" and "a" strings.' };
      }
    }
    return { ok: true, value: parsed as Array<{ q: string; a: string }> };
  }

  async function save() {
    setError(null);
    setNotice(null);
    if (!title.trim()) return setError('Title is required.');
    if (!slug.trim()) return setError('Slug is required.');
    if (metaTitle.trim().length > 60) return setError('Meta title must be ≤ 60 characters.');
    if (metaDescription.trim().length > 155) return setError('Meta description must be ≤ 155 characters.');
    if (!excerpt.trim()) return setError('Excerpt is required.');
    if (!markdown.trim()) return setError('Content is required.');
    if (!categoryId) return setError('Choose a category.');
    if (!authorId) return setError('Choose an author.');
    if (status === 'scheduled' && !scheduledLocal.trim()) {
      return setError('Scheduled posts need a date/time.');
    }
    const faq = validateFaq();
    if (!faq.ok) return setError(faq.message);

    const body = {
      title: title.trim(),
      slug: slug.trim(),
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      excerpt: excerpt.trim(),
      markdown,
      categoryId,
      authorId,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      status,
      scheduledFor: fromLocalInput(scheduledLocal),
      featuredImageUrl: featuredImageUrl.trim() || null,
      featuredImageAlt: featuredImageAlt.trim() || null,
      secondaryImageUrl: secondaryImageUrl.trim() || null,
      secondaryImageAlt: secondaryImageAlt.trim() || null,
      secondaryImageAfterHeading: secondaryAfterHeading.trim() || null,
      faq: faq.value,
      keyTakeaways: takeawaysText.split('\n').map((s) => s.trim()).filter(Boolean),
      canonicalUrl: canonicalUrl.trim() || null,
      noindex,
    };

    setSaving(true);
    try {
      await adminFetch(isNew ? '/api/admin/posts' : `/api/admin/posts/${initial.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNotice(isNew ? 'Post created.' : 'Post saved.');
      router.push(`${basePath}/posts`);
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await adminFetch(`/api/admin/posts/${initial.id}`, { method: 'DELETE' });
      router.push(`${basePath}/posts`);
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Delete failed.');
    }
  }

  const metaTitleOver = metaTitle.length > 60;
  const metaDescOver = metaDescription.length > 155;

  return (
    <div>
      <PageHeader
        title={isNew ? 'New post' : 'Edit post'}
        subtitle={isNew ? undefined : `/${initial.slug}`}
        actions={
          <>
            {!isNew && <Badge value={status} />}
            {!isNew && (
              <ConfirmButton
                onConfirm={remove}
                confirmText="Delete this post permanently?"
                className={btnDanger}
              >
                Delete
              </ConfirmButton>
            )}
            <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isNew ? 'Create post' : 'Save changes'}
            </button>
          </>
        }
      />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="space-y-4">
              <Field label="Title">
                <input className={inputClass} value={title} onChange={(e) => onTitleChange(e.target.value)} maxLength={200} />
              </Field>
              <Field label="Slug" hint="Lowercase letters, numbers and dashes only.">
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} font-mono`}
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    maxLength={140}
                  />
                  <button
                    type="button"
                    className={btnSecondary}
                    title="Regenerate from title"
                    onClick={() => {
                      setSlug(slugify(title));
                      setSlugTouched(false);
                    }}
                  >
                    ↻
                  </button>
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Meta title (${metaTitle.length}/60)`}
                  hint={metaTitleOver ? 'Too long — shorten to 60 characters.' : 'Keep under 60 characters.'}
                >
                  <input
                    className={`${inputClass} ${metaTitleOver ? 'border-red-400' : ''}`}
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                  />
                </Field>
                <Field
                  label={`Meta description (${metaDescription.length}/155)`}
                  hint={metaDescOver ? 'Too long — shorten to 155 characters.' : 'Keep under 155 characters.'}
                >
                  <textarea
                    className={`${inputClass} ${metaDescOver ? 'border-red-400' : ''}`}
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    rows={3}
                  />
                </Field>
              </div>
              <Field label="Excerpt" hint="Shown on cards and in search results.">
                <textarea className={inputClass} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} maxLength={400} />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Content</h2>
              <div className="flex rounded-lg border border-stone-300 p-0.5 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setTab('write')}
                  className={`rounded-md px-3 py-1 ${tab === 'write' ? 'bg-brand-700 text-white' : 'text-ink-soft'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={`rounded-md px-3 py-1 ${tab === 'preview' ? 'bg-brand-700 text-white' : 'text-ink-soft'}`}
                >
                  Preview
                </button>
              </div>
            </div>
            {tab === 'write' ? (
              <div data-color-mode="light">
                <MDEditor
                  value={markdown}
                  onChange={(v) => setMarkdown(v ?? '')}
                  height={520}
                  preview="edit"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-white p-5">
                {previewHtml.trim() ? (
                  <div className="article-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <p className="text-sm text-ink-soft">Nothing to preview yet.</p>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Markdown is converted to sanitized HTML on save (headings, lists, tables, images and links are preserved; scripts are stripped).
            </p>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">Images</h2>
            <div className="space-y-4">
              <Field label="Featured image URL">
                <div className="flex gap-2">
                  <input className={`${inputClass} font-mono`} value={featuredImageUrl} onChange={(e) => setFeaturedImageUrl(e.target.value)} placeholder="https://…" />
                  <button type="button" className={btnSecondary} onClick={() => setPickerFor('featured')}>
                    Library
                  </button>
                </div>
              </Field>
              <Field label="Featured image alt text">
                <input className={inputClass} value={featuredImageAlt} onChange={(e) => setFeaturedImageAlt(e.target.value)} maxLength={200} />
              </Field>
              <Field label="Secondary image URL">
                <div className="flex gap-2">
                  <input className={`${inputClass} font-mono`} value={secondaryImageUrl} onChange={(e) => setSecondaryImageUrl(e.target.value)} placeholder="https://…" />
                  <button type="button" className={btnSecondary} onClick={() => setPickerFor('secondary')}>
                    Library
                  </button>
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Secondary image alt text">
                  <input className={inputClass} value={secondaryImageAlt} onChange={(e) => setSecondaryImageAlt(e.target.value)} maxLength={200} />
                </Field>
                <Field label="Insert after heading" hint="Heading text after which the secondary image appears.">
                  <input className={inputClass} value={secondaryAfterHeading} onChange={(e) => setSecondaryAfterHeading(e.target.value)} maxLength={160} />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">FAQ & takeaways</h2>
            <div className="space-y-4">
              <Field label="FAQ (JSON)" hint='Array of {"q","a"} objects. Leave empty for none.'>
                <textarea
                  className={`${inputClass} font-mono`}
                  value={faqText}
                  onChange={(e) => setFaqText(e.target.value)}
                  rows={6}
                  placeholder='[{"q":"…","a":"…"}]'
                  spellCheck={false}
                />
              </Field>
              <Field label="Key takeaways" hint="One per line.">
                <textarea
                  className={inputClass}
                  value={takeawaysText}
                  onChange={(e) => setTakeawaysText(e.target.value)}
                  rows={5}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">Publish</h2>
            <div className="space-y-4">
              <Field label="Status">
                <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
                  {postStatuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Scheduled for" hint="Your local time; stored as UTC.">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                />
              </Field>
              <Field label="Category">
                <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Author">
                <select className={inputClass} value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags" hint="Comma-separated. New tags are created automatically.">
                <input className={inputClass} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="dog training, puppies" />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-bold text-ink">SEO extras</h2>
            <div className="space-y-4">
              <Field label="Canonical URL" hint="Optional. Leave empty to use the post URL.">
                <input className={`${inputClass} font-mono`} value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} placeholder="https://…" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} className="h-4 w-4 accent-brand-700" />
                noindex this post
              </label>
            </div>
          </Card>
        </div>
      </div>

      {pickerFor && (
        <MediaPicker
          onClose={() => setPickerFor(null)}
          onPick={(m) => {
            if (pickerFor === 'featured') {
              setFeaturedImageUrl(m.url);
              if (!featuredImageAlt && m.alt) setFeaturedImageAlt(m.alt);
            } else {
              setSecondaryImageUrl(m.url);
              if (!secondaryImageAlt && m.alt) setSecondaryImageAlt(m.alt);
            }
          }}
        />
      )}
    </div>
  );
}
