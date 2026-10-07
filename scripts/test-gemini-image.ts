// Unit test for the Gemini image provider path in lib/agent/images.ts.
// Mocks ONLY global fetch (the HTTP layer); the real geminiImage() request
// building + response parsing logic runs unmodified.
//
// Run: npx tsx scripts/test-gemini-image.ts
// Exits 0 on success, 1 on any assertion failure.

import { geminiImage } from '../lib/agent/images';

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
// A real 1x1 PNG (base64) standing in for a model-generated image, padded
// past the provider's 1KB minimum-bytes sanity check.
const FAKE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const FAKE_BIG_B64 = Buffer.concat([
  Buffer.from(FAKE_PNG_B64, 'base64'),
  Buffer.alloc(2048),
]).toString('base64');

// --- Test 1: request shape -------------------------------------------------
let capturedUrl = '';
let capturedHeaders: Record<string, string> = {};
let capturedBody = '';
const okResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [
            { text: 'Here is your image.' },
            { inlineData: { mimeType: 'image/png', data: FAKE_BIG_B64 } },
          ],
        },
      },
    ],
  }),
  text: async () => '',
};

(globalThis as { fetch: unknown }).fetch = async (
  url: string,
  init: { headers?: Record<string, string>; body?: string },
) => {
  capturedUrl = url;
  capturedHeaders = init.headers ?? {};
  capturedBody = init.body ?? '';
  return okResponse;
};

process.env.GEMINI_API_KEY = 'test-key-123';
const buf = await geminiImage('A golden retriever puppy playing in a sunny park, photorealistic');

check(
  'hits the generateContent endpoint for gemini-2.5-flash-image',
  capturedUrl ===
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
  capturedUrl,
);
check('sends the API key via x-goog-api-key header', capturedHeaders['x-goog-api-key'] === 'test-key-123');
check('sends JSON content type', capturedHeaders['Content-Type'] === 'application/json');
const body = JSON.parse(capturedBody) as {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: { responseModalities: string[]; imageConfig: { aspectRatio: string } };
};
check('prompt is in contents[0].parts[0].text', body.contents[0]?.parts[0]?.text?.includes('golden retriever') === true);
check(
  'responseModalities includes IMAGE',
  body.generationConfig?.responseModalities?.includes('IMAGE') === true,
);
check('aspectRatio is 16:9', body.generationConfig?.imageConfig?.aspectRatio === '16:9');
check('decodes base64 image bytes', buf.length > 100 && buf.subarray(1, 4).toString() === 'PNG');

// --- Test 2: HTTP error surfaces -------------------------------------------
(globalThis as { fetch: unknown }).fetch = async () => ({
  ok: false,
  status: 400,
  json: async () => ({}),
  text: async () => 'API key not valid.',
});
let threw = '';
try {
  await geminiImage('prompt');
} catch (err) {
  threw = err instanceof Error ? err.message : String(err);
}
check('HTTP error throws with status + body', threw.includes('400') && threw.includes('API key not valid'), threw);

// --- Test 3: no image part throws ------------------------------------------
(globalThis as { fetch: unknown }).fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: 'no image for you' }] } }] }),
  text: async () => '',
});
threw = '';
try {
  await geminiImage('prompt');
} catch (err) {
  threw = err instanceof Error ? err.message : String(err);
}
check('response without image data throws', threw.includes('no image data'), threw);

// --- Test 4: missing API key throws ----------------------------------------
delete process.env.GEMINI_API_KEY;
threw = '';
try {
  await geminiImage('prompt');
} catch (err) {
  threw = err instanceof Error ? err.message : String(err);
}
check('missing GEMINI_API_KEY throws', threw.includes('GEMINI_API_KEY'), threw);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Gemini image provider assertions passed.');
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
