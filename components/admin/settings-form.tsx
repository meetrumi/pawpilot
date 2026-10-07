'use client';

// Site settings form: loads current values from /api/admin/settings and saves
// via setSetting-backed PUT.

import { useEffect, useState } from 'react';
import { AdminApiError, useAdminFetch } from './admin-context';
import {
  Card,
  ErrorAlert,
  Field,
  PageHeader,
  Spinner,
  SuccessAlert,
  btnPrimary,
  inputClass,
} from './ui';

const TEXT_FIELDS: Array<{ key: string; label: string; hint?: string; type?: string }> = [
  { key: 'site_name', label: 'Site name' },
  { key: 'site_tagline', label: 'Site tagline' },
  { key: 'logo_text', label: 'Logo text', hint: 'Short text used in the logo lockup.' },
  { key: 'contact_email', label: 'Contact email', type: 'email' },
  { key: 'seo_default_title_suffix', label: 'Default title suffix', hint: 'Appended to page titles, e.g. "| PawPilot".' },
  { key: 'seo_default_description', label: 'Default meta description' },
  { key: 'adsense_client_id', label: 'AdSense client ID', hint: 'e.g. ca-pub-XXXXXXXXXXXXXXXX.' },
];

export function SettingsForm() {
  const adminFetch = useAdminFetch();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [adsEnabled, setAdsEnabled] = useState(false);
  const [newsletterEnabled, setNewsletterEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/settings')
      .then((d) => {
        if (cancelled) return;
        const s = (d as { settings: Record<string, string> }).settings;
        setValues(s);
        setAdsEnabled(s.ads_enabled === 'true');
        setNewsletterEnabled(s.newsletter_enabled !== 'false');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AdminApiError ? e.message : 'Failed to load settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminFetch]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!values) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          ads_enabled: adsEnabled,
          newsletter_enabled: newsletterEnabled,
        }),
      });
      setNotice('Settings saved.');
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading settings…" />;
  if (!values) return <ErrorAlert message={error ?? 'Could not load settings.'} />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Site-wide settings stored in the database." />
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />
      <form onSubmit={save} className="max-w-2xl space-y-5">
        <Card>
          <div className="space-y-4">
            {TEXT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  type={f.type ?? 'text'}
                  className={inputClass}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...(v ?? {}), [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-bold text-ink">Features</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={adsEnabled}
                onChange={(e) => setAdsEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-700"
              />
              <span>
                <strong className="text-ink">Ads enabled</strong>
                <span className="block text-ink-soft">Show display ads (requires an AdSense client ID).</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={newsletterEnabled}
                onChange={(e) => setNewsletterEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-700"
              />
              <span>
                <strong className="text-ink">Newsletter enabled</strong>
                <span className="block text-ink-soft">Show the newsletter signup capture on the site.</span>
              </span>
            </label>
          </div>
        </Card>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}
