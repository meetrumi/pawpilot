// DELETE /api/admin/media/[id] — delete a Media row; best-effort file removal
// for locally stored uploads (Supabase objects are left to bucket lifecycle).

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { requireAdmin, toErrorResponse } from '@/lib/admin/route';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin(req, { csrf: true });
    const { id } = await params;

    const media = await db.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
    }

    await db.media.delete({ where: { id } });

    // Best-effort: remove the local file. Never fail the request over this.
    if (media.url.startsWith('/uploads/')) {
      try {
        const filePath = path.join(process.cwd(), 'public', media.url);
        await fs.unlink(filePath);
      } catch (err) {
        console.error(`[api/admin/media] could not remove local file for ${id}:`, err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
