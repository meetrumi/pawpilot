// Image generation for the PawPilot agent pipeline.
//
// Exactly 2 topical images per post:
//   primary  -> Google Gemini image generation (gemini-3.1-flash-image),
//               only when GEMINI_API_KEY is set
//   fallback -> Pollinations image API (no key)
//   fallback -> Pexels search API, only when PEXELS_API_KEY is set
// Bytes are downloaded, converted with sharp to WebP (quality 80, max width
// 1200), and persisted via lib/storage.ts (Supabase or local public/uploads),
// which also creates the Media row. Each image gets descriptive alt text.
//
// The secondary image's placementHeading (the H2 its content relates to) is
// decided by the writer draft; pipeline.ts overrides our default with the
// draft's secondaryPlacementHeading when present.

import sharp from 'sharp';
import { saveImageFromBuffer } from '../storage';
import { slugify } from '../format';
import type { FixedTopic } from './types';

export interface ImageInfo {
  url: string;
  alt: string;
  width: number;
  height: number;
  sizeBytes: number;
  mediaId: string;
}

export interface GeneratedImages {
  featured: ImageInfo;
  secondary: ImageInfo;
  placementHeading: string;
}

const FETCH_TIMEOUT_MS = 90_000;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const GEMINI_IMAGE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

function log(step: string, detail: string): void {
  console.log(`[images] ${step}: ${detail}`);
}

function imagePrompt(topic: FixedTopic, primary: boolean): string {
  const subject = topic.angle || topic.keyword;
  const base =
    'Warm, professional pet photography style, natural light, sharp focus, ' +
    'cozy home environment, no text, no watermark, no humans with visible faces';
  return primary
    ? `${base}. A heartwarming scene illustrating: ${topic.keyword}. ${subject}`
    : `${base}. A close-up detail scene related to: ${topic.keyword}. ${subject}. Different angle and composition from a wide establishing shot.`;
}

function altText(topic: FixedTopic, primary: boolean): string {
  return primary
    ? `Illustration for a guide about ${topic.keyword}`
    : `Detail photo illustrating ${topic.keyword} — ${topic.secondaryKeywords[0] ?? 'practical pet care tip'}`;
}

async function downloadImage(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`image download failed: HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`image download returned non-image content (${contentType})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function processToWebp(buf: Buffer): Promise<Buffer> {
  return sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

async function pollinationsImage(prompt: string, seed: number): Promise<Buffer> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1200&height=630&nologo=true&seed=${seed}`;
  log('fetch', `Pollinations image (seed=${seed})`);
  return downloadImage(url);
}

interface PexelsPhoto {
  src?: { large?: string; original?: string };
  alt?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  // snake_case variant seen in some SDK-shaped payloads; REST uses camelCase.
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string; status?: string };
}

/**
 * Generate an image with Google Gemini (gemini-3.1-flash-image, "Nano Banana 2").
 * REST shape (verified against Google AI docs + community examples):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent
 *   headers: x-goog-api-key: <key>, Content-Type: application/json
 *   body: { contents: [{ parts: [{ text }] }],
 *           generationConfig: { responseModalities: ["TEXT","IMAGE"],
 *                               imageConfig: { aspectRatio: "16:9" } } }
 * The image comes back base64-encoded in
 * candidates[0].content.parts[].inlineData.data (camelCase in REST JSON).
 *
 * Exported for unit testing (the test mocks global fetch, not this logic).
 */
export async function geminiImage(prompt: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('gemini: GEMINI_API_KEY is not set');
  log('fetch', `Gemini image (${GEMINI_IMAGE_MODEL})`);
  const res = await fetch(GEMINI_IMAGE_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gemini: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as GeminiResponse;
  if (data.error) {
    throw new Error(`gemini: API error ${data.error.status ?? ''} ${data.error.message ?? ''}`.trim());
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const b64 = part.inlineData?.data ?? part.inline_data?.data;
    if (b64) {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 1024) return buf;
    }
  }
  throw new Error('gemini: no image data in response');
}

async function pexelsImage(query: string): Promise<Buffer> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('pexels: PEXELS_API_KEY is not set');
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
  log('fetch', `Pexels search: "${query}"`);
  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`pexels: HTTP ${res.status}`);
  const data = (await res.json()) as { photos?: PexelsPhoto[] };
  const photo = data.photos?.[0];
  const src = photo?.src?.large ?? photo?.src?.original;
  if (!src) throw new Error('pexels: no photos returned');
  log('fetch', `Pexels photo: ${src.slice(0, 80)}…`);
  return downloadImage(src);
}

async function makeImage(
  topic: FixedTopic,
  primary: boolean,
  seed: number,
): Promise<{ info: ImageInfo; kind: string }> {
  const baseName = slugify(topic.keyword).slice(0, 60) || 'pawpilot';
  const fileName = `${baseName}-${primary ? 'featured' : 'secondary'}-${seed}.webp`;
  const alt = altText(topic, primary);
  const prompt = imagePrompt(topic, primary);

  // Provider chain: Gemini (key) -> Pollinations (no key) -> Pexels (key).
  const attempts: Array<{ name: string; run: () => Promise<Buffer> }> = [];
  if (process.env.GEMINI_API_KEY) {
    attempts.push({ name: 'gemini', run: () => geminiImage(prompt) });
  }
  attempts.push({ name: 'pollinations', run: () => pollinationsImage(prompt, seed) });
  if (process.env.PEXELS_API_KEY) {
    attempts.push({ name: 'pexels', run: () => pexelsImage(topic.keyword) });
  }

  let raw: Buffer | null = null;
  let kind = '';
  let lastErr: unknown = new Error('no image providers configured');
  for (const attempt of attempts) {
    try {
      raw = await attempt.run();
      kind = attempt.name;
      break;
    } catch (err) {
      lastErr = err;
      log('warn', `${attempt.name} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!raw) {
    throw lastErr instanceof Error ? lastErr : new Error('all image providers failed');
  }
  const webp = await processToWebp(raw);
  const saved = await saveImageFromBuffer(webp, {
    fileName,
    alt,
    source: `agent:${kind}`,
  });
  const info: ImageInfo = { ...saved, alt };
  log('done', `${primary ? 'featured' : 'secondary'} via ${kind}: ${info.url} (${info.width}x${info.height}, ${info.sizeBytes} bytes)`);
  return { info, kind };
}

/**
 * Generate exactly 2 topical images (featured + secondary) for a topic.
 * The secondary image's placementHeading defaults to a sensible section;
 * pipeline.ts lets the writer draft override it.
 */
export async function generateImages(topic: FixedTopic, primaryKeyword: string): Promise<GeneratedImages> {
  log('start', `"${primaryKeyword}"`);
  const seedBase = Math.floor(Math.random() * 1_000_000);
  const [featured, secondary] = await Promise.all([
    makeImage(topic, true, seedBase),
    makeImage(topic, false, seedBase + 1),
  ]);
  return {
    featured: featured.info,
    secondary: secondary.info,
    placementHeading: 'Frequently asked questions',
  };
}
