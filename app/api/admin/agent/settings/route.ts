// PUT /api/admin/agent/settings — persist agent configuration to the Setting table.

import { NextRequest, NextResponse } from 'next/server';
import { setSetting } from '@/lib/settings';
import { agentSettingsSchema } from '@/lib/admin/schemas';
import { COMMON_TIMEZONES } from '@/lib/admin/schedule';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = agentSettingsSchema.parse(parsed.body);

    if (!COMMON_TIMEZONES.includes(input.timezone)) {
      return NextResponse.json(
        { error: 'Unsupported timezone. Pick one from the list.' },
        { status: 400 },
      );
    }

    await Promise.all([
      setSetting('agent_enabled', String(input.agent_enabled)),
      setSetting('agent_mode', input.agent_mode),
      setSetting('posts_per_day', String(input.posts_per_day)),
      setSetting('publish_times', JSON.stringify(input.publish_times)),
      setSetting('timezone', input.timezone),
      setSetting('tone_instructions', input.tone_instructions),
      setSetting('banned_words', JSON.stringify(input.banned_words)),
      setSetting('word_count_target', String(input.word_count_target)),
      setSetting('refresh_enabled', String(input.refresh_enabled)),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
