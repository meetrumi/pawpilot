import { getAdsSettings } from '@/lib/data';

export type AdSlotPosition = 'below-title' | 'mid-article' | 'below-content';

const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * AdSense slot. Renders nothing unless ads are explicitly enabled in settings
 * (ads_enabled === "true") AND an AdSense client id is configured.
 * Disabled by default.
 *
 * The first slot on the page also loads the AdSense library; each slot then
 * queues its own unit. NOTE: the site CSP (middleware.ts) currently restricts
 * script-src, so enabling ads also requires allowlisting the AdSense domains
 * in the CSP — flagged for the admin/middleware owner.
 */
export async function AdSlot({ slot }: { slot: AdSlotPosition }) {
  const { enabled, clientId } = await getAdsSettings();
  if (!enabled || !clientId) return null;
  const loaderSrc = `${ADSENSE_SRC}?client=${encodeURIComponent(clientId)}`;
  return (
    <div className="ad-slot my-8" data-ad-slot={slot}>
      <p
        className="mb-1 text-center text-[11px] uppercase tracking-widest text-ink-soft/70"
        aria-hidden="true"
      >
        Advertisement
      </p>
      {slot === 'below-title' && (
        <script async src={loaderSrc} crossOrigin="anonymous" />
      )}
      <ins
        className="adsbygoogle block"
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <script
        // Queues this unit with the AdSense library.
        dangerouslySetInnerHTML={{
          __html: '(window.adsbygoogle=window.adsbygoogle||[]).push({});',
        }}
      />
    </div>
  );
}
