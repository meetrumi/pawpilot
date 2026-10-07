'use client';

// Media library: upload form (multipart -> /api/admin/media -> Phase C
// saveImageFromBuffer) and a grid of stored media with copy-URL + delete.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError, useAdminFetch } from './admin-context';
import {
  Card,
  ConfirmButton,
  EmptyState,
  ErrorAlert,
  Field,
  PageHeader,
  Spinner,
  SuccessAlert,
  btnDanger,
  btnPrimary,
  btnSecondary,
  inputClass,
} from './ui';

interface MediaItem {
  id: string;
  url: string;
  alt: string | null;
  fileName: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: string;
  createdAt: string;
}

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function MediaLibrary() {
  const adminFetch = useAdminFetch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    const d = (await adminFetch('/api/admin/media')) as { media: MediaItem[] };
    return d.media;
  }, [adminFetch]);

  useEffect(() => {
    let cancelled = false;
    fetchMedia()
      .then((media) => {
        if (!cancelled) setItems(media);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load media.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMedia]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchMedia());
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Failed to load media.');
    } finally {
      setLoading(false);
    }
  }, [fetchMedia]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose an image file first.');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('alt', alt.trim());
      // adminFetch attaches the CSRF token; the browser sets the multipart boundary.
      const d = (await adminFetch('/api/admin/media', { method: 'POST', body: form })) as {
        media: { url: string };
      };
      setNotice(`Uploaded: ${d.media.url}`);
      setAlt('');
      if (fileRef.current) fileRef.current.value = '';
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await adminFetch(`/api/admin/media/${id}`, { method: 'DELETE' });
      setNotice('Image deleted.');
      await refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Delete failed.');
    }
  }

  async function copyUrl(item: MediaItem) {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1500);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }

  return (
    <div>
      <PageHeader title="Media Library" subtitle="Upload images and reuse their URLs in posts." />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      <Card className="mb-6">
        <h2 className="mb-4 text-base font-bold text-ink">Upload image</h2>
        <form onSubmit={upload} className="flex flex-wrap items-end gap-4">
          <Field label="File" hint="JPEG, PNG, WebP or GIF — max 8 MB.">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className={inputClass} disabled={uploading} />
          </Field>
          <Field label="Alt text" className="min-w-52 flex-1">
            <input className={inputClass} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image…" maxLength={200} disabled={uploading} />
          </Field>
          <button type="submit" className={btnPrimary} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">
          Stored via Supabase Storage when configured, otherwise in <span className="font-mono">public/uploads</span>.
        </p>
      </Card>

      {loading ? (
        <Spinner label="Loading media…" />
      ) : items.length === 0 ? (
        <EmptyState message="No media yet. Upload your first image above." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <Card key={m.id} className="overflow-hidden p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? ''} className="aspect-video w-full object-cover" loading="lazy" />
              <div className="p-3">
                <div className="truncate font-mono text-xs text-ink" title={m.fileName}>
                  {m.fileName}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {m.width && m.height ? `${m.width}×${m.height}` : '—'} · {formatBytes(m.sizeBytes)}
                </div>
                {m.alt && <div className="mt-1 truncate text-xs text-ink-soft" title={m.alt}>alt: {m.alt}</div>}
                <div className="mt-3 flex gap-2">
                  <button type="button" className={btnSecondary} onClick={() => copyUrl(m)}>
                    {copiedId === m.id ? 'Copied!' : 'Copy URL'}
                  </button>
                  <ConfirmButton onConfirm={() => remove(m.id)} confirmText="Delete this image? Posts using its URL will break." className={btnDanger}>
                    Delete
                  </ConfirmButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
