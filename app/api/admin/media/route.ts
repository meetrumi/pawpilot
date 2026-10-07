// /api/admin/media — list (GET) and upload (POST).
//
// Uploads go through Phase C's lib/storage.ts saveImageFromBuffer, which
// persists the file (Supabase Storage when configured, otherwise local
// public/uploads) and creates the Media row itself.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { saveImageFromBuffer } from '@/lib/storage';
import { db } from '@/lib/db';
import { ALLOWED_UPLOAD_MIMES, MAX_UPLOAD_BYTES } from '@/lib/admin/schemas';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false });
    const media = await db.media.findMany({
      orderBy: { createdAt: 'desc' },
      take: 120,
    });
    return NextResponse.json({ media });
  } catch (err) {
    return toErrorResponse(err);
  }
}

function safeFileName(original: string): string {
  const base = original
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^(-|\.)+|(-|\.)+$/g, '')
    .slice(0, 80);
  const stem = base || 'upload';
  const suffix = randomBytes(4).toString('hex');
  return `${Date.now()}-${suffix}-${stem}`;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'Expected a multipart form upload.' },
        { status: 400 },
      );
    }

    const file = form.get('file');
    const alt = typeof form.get('alt') === 'string' ? (form.get('alt') as string).trim() : '';
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }
    if (!(ALLOWED_UPLOAD_MIMES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type "${file.type || 'unknown'}". Allowed: JPEG, PNG, WebP, GIF.`,
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 8 MB.` },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const saved = await saveImageFromBuffer(buf, {
      fileName: safeFileName(file.name),
      alt: alt || undefined,
      source: 'admin-upload',
    });
    return NextResponse.json({ ok: true, media: saved }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
