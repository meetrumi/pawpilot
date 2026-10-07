// /api/admin/team/[id] — update / delete a Team user. Super-admin only.
//
// PATCH  -> { password? } resets the password, { isActive? } toggles access.
// DELETE -> removes the user.

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { teamUserUpdateSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

const SUPERADMIN = { roles: ['superadmin'] as const };

const publicFields = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req, { csrf: true, ...SUPERADMIN });
    const { id } = await params;
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = teamUserUpdateSchema.parse(parsed.body);
    if (input.password === undefined && input.isActive === undefined) {
      return NextResponse.json(
        { error: 'Nothing to update: provide password and/or isActive.' },
        { status: 400 },
      );
    }
    const data: { passwordHash?: string; isActive?: boolean } = {};
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, 12);
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }
    const user = await db.adminUser.update({
      where: { id },
      data,
      select: publicFields,
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req, { csrf: true, ...SUPERADMIN });
    const { id } = await params;
    await db.adminUser.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
