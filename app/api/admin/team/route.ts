// /api/admin/team — Team (child admin user) management. Super-admin only.
//
// GET  -> list users (password hashes never leave the server)
// POST -> create user { username, password, isActive? }

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { teamUserCreateSchema } from '@/lib/admin/schemas';
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

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false, ...SUPERADMIN });
    const users = await db.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
      select: publicFields,
    });
    return NextResponse.json({ users });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin(req, { csrf: true, ...SUPERADMIN });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = teamUserCreateSchema.parse(parsed.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.adminUser.create({
      data: {
        username: input.username,
        passwordHash,
        role: 'editor',
        isActive: input.isActive ?? true,
        createdBy: session.username,
      },
      select: publicFields,
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
