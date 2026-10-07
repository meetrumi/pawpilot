// /api/admin/settings — read (GET) and save (PUT) site settings.
// Persisted via the Setting table (lib/settings.ts setSetting/getSetting).

import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/settings';
import { settingsWriteSchema } from '@/lib/admin/schemas';
import { readJsonBody, requireAdmin, toErrorResponse } from '@/lib/admin/route';

export const SITE_SETTING_KEYS = [
  'site_name',
  'site_tagline',
  'logo_text',
  'contact_email',
  'seo_default_title_suffix',
  'seo_default_description',
  'ads_enabled',
  'adsense_client_id',
  'newsletter_enabled',
] as const;

const DEFAULTS: Record<(typeof SITE_SETTING_KEYS)[number], string> = {
  site_name: 'PawPilot',
  site_tagline: 'Happy pets, confident owners.',
  logo_text: 'PawPilot',
  contact_email: '',
  seo_default_title_suffix: '| PawPilot',
  seo_default_description:
    'Practical pet-care guides: dog training, cat care, breed guides, pet health basics, and honest product reviews.',
  ads_enabled: 'false',
  adsense_client_id: '',
  newsletter_enabled: 'true',
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: false, roles: ['superadmin'] });
    const entries = await Promise.all(
      SITE_SETTING_KEYS.map(async (key) => [key, await getSetting(key, DEFAULTS[key])] as const),
    );
    return NextResponse.json({ settings: Object.fromEntries(entries) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req, { csrf: true, roles: ['superadmin'] });
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const input = settingsWriteSchema.parse(parsed.body);

    const writes: Array<[string, string]> = [];
    if (input.site_name !== undefined) writes.push(['site_name', input.site_name]);
    if (input.site_tagline !== undefined) writes.push(['site_tagline', input.site_tagline]);
    if (input.logo_text !== undefined) writes.push(['logo_text', input.logo_text]);
    if (input.contact_email !== undefined) writes.push(['contact_email', input.contact_email]);
    if (input.seo_default_title_suffix !== undefined)
      writes.push(['seo_default_title_suffix', input.seo_default_title_suffix]);
    if (input.seo_default_description !== undefined)
      writes.push(['seo_default_description', input.seo_default_description]);
    if (input.ads_enabled !== undefined) writes.push(['ads_enabled', String(input.ads_enabled)]);
    if (input.adsense_client_id !== undefined)
      writes.push(['adsense_client_id', input.adsense_client_id]);
    if (input.newsletter_enabled !== undefined)
      writes.push(['newsletter_enabled', String(input.newsletter_enabled)]);

    await Promise.all(writes.map(([key, value]) => setSetting(key, value)));
    return NextResponse.json({ ok: true, saved: writes.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
