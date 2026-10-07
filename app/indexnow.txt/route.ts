/**
 * Serves the IndexNow API key as plain text so the key can be hosted at
 * https://<domain>/indexnow.txt (the keyLocation IndexNow expects).
 * Returns an empty 404 when INDEXNOW_KEY is not configured.
 */
export async function GET(): Promise<Response> {
  const key = (process.env.INDEXNOW_KEY ?? '').trim();
  if (!key) {
    return new Response(null, { status: 404 });
  }
  return new Response(`${key}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
