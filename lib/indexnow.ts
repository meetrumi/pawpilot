// IndexNow instant-indexing ping, sent when posts are published.
// Skips gracefully (with a log line) when INDEXNOW_KEY is not set.

export interface IndexNowResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
}

/** Resolve the public host for the keyLocation URL. */
function resolveHost(urls: string[]): string {
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return new URL(siteUrl).host;
  if (urls.length > 0) return new URL(urls[0]).host;
  throw new Error('indexnow: cannot determine host (set SITE_URL)');
}

/**
 * POST the URL list to api.indexnow.org. Returns {ok:false, skipped:true}
 * when INDEXNOW_KEY is unset instead of throwing.
 */
export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    console.log('[indexnow] INDEXNOW_KEY not set; skipping ping');
    return { ok: false, skipped: true };
  }
  if (urls.length === 0) {
    console.log('[indexnow] no URLs to ping; skipping');
    return { ok: false, skipped: true };
  }
  const host = resolveHost(urls);
  const body = {
    host,
    key,
    keyLocation: `https://${host}/indexnow.txt`,
    urlList: urls,
  };
  console.log(`[indexnow] pinging ${urls.length} URL(s) for host ${host}`);
  const res = await fetch('https://api.indexnow.org/indexnow.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  // 200 = OK, 202 = accepted. Anything else is a soft failure: log, don't throw.
  const ok = res.status === 200 || res.status === 202;
  if (!ok) {
    console.warn(`[indexnow] ping failed: HTTP ${res.status}`);
  } else {
    console.log(`[indexnow] ping accepted (HTTP ${res.status})`);
  }
  return { ok, status: res.status };
}
