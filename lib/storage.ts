// Media storage for the PawPilot agent pipeline.
//
// Priority:
//   1. Vercel Blob (BLOB_READ_WRITE_TOKEN) — the only persistent option on
//      Vercel serverless; also used by the GitHub Actions runner so images
//      land in the same place regardless of where the agent runs.
//   2. Supabase Storage bucket `images` (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//   3. Local public/uploads/YYYY/MM/ (dev only — ephemeral on serverless).
// A Media row is always created in Postgres.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { db } from './db';

export interface SavedImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mediaId: string;
}

export interface SaveImageOptions {
  fileName: string;
  alt?: string;
  source: string;
}

/** Image metadata via sharp (no upload). */
export async function getImageMetadata(buf: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}> {
  const meta = await sharp(buf).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown',
    sizeBytes: buf.length,
  };
}

function uploadPath(fileName: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `pawpilot/${yyyy}/${mm}/${fileName}`;
}

async function uploadToSupabase(buf: Buffer, fileName: string): Promise<string> {
  const base = process.env.SUPABASE_URL!.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const objectPath = uploadPath(fileName);
  const objectUrl = `${base}/storage/v1/object/images/${objectPath}`;

  const put = () =>
    fetch(objectUrl, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'image/webp',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(60_000),
    });

  let res = await put();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Bucket may not exist yet: try creating it once, then retry the upload.
    if (res.status === 400 || res.status === 404) {
      console.log(`[storage] bucket "images" missing (${res.status}); attempting to create it`);
      const created = await fetch(`${base}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'images', name: 'images', public: true }),
        signal: AbortSignal.timeout(30_000),
      });
      if (created.ok) {
        console.log('[storage] bucket "images" created');
        res = await put();
      } else {
        throw new Error(
          `Supabase upload failed and bucket creation failed: HTTP ${created.status} ${await created.text().catch(() => '')}`,
        );
      }
    }
    if (!res.ok) {
      throw new Error(`Supabase upload failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
  }
  return objectUrl;
}

async function uploadToBlob(buf: Buffer, fileName: string): Promise<string> {
  const objectPath = uploadPath(fileName);
  console.log(`[storage] uploading ${fileName} to Vercel Blob`);
  const blob = await put(objectPath, buf, {
    access: 'public',
    contentType: 'image/webp',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

async function saveLocal(buf: Buffer, fileName: string): Promise<string> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(process.cwd(), 'public', 'uploads', yyyy, mm);
  await fs.mkdir(dir, { recursive: true });
  const safe = fileName.replace(/[^a-z0-9._-]/gi, '-');
  await fs.writeFile(path.join(dir, safe), buf);
  return `/uploads/${yyyy}/${mm}/${safe}`;
}

/**
 * Persist an image buffer and record it in the Media table.
 * Returns the public URL, dimensions, byte size, and the Media id.
 */
export async function saveImageFromBuffer(buf: Buffer, opts: SaveImageOptions): Promise<SavedImage> {
  const meta = await getImageMetadata(buf);
  const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const useSupabase = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  let url: string;
  if (useBlob) {
    url = await uploadToBlob(buf, opts.fileName);
  } else if (useSupabase) {
    console.log(`[storage] uploading ${opts.fileName} to Supabase Storage`);
    url = await uploadToSupabase(buf, opts.fileName);
  } else {
    console.log(`[storage] saving ${opts.fileName} to local public/uploads (no Blob/Supabase configured)`);
    url = await saveLocal(buf, opts.fileName);
  }

  const media = await db.media.create({
    data: {
      url,
      alt: opts.alt ?? null,
      fileName: opts.fileName,
      width: meta.width,
      height: meta.height,
      mimeType: 'image/webp',
      sizeBytes: meta.sizeBytes,
      source: opts.source,
    },
  });

  return {
    url,
    width: meta.width,
    height: meta.height,
    sizeBytes: meta.sizeBytes,
    mediaId: media.id,
  };
}
