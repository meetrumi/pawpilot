// LLM provider chain for the PawPilot agent pipeline.
//
// Order: Google Gemini -> OpenRouter -> Pollinations (no key).
// Providers without a configured API key are skipped. Each provider retries
// with exponential backoff (1s, 2s, 4s) on 429/408/5xx. An error is thrown
// only when every provider has failed. All calls are real HTTP via fetch.
//
// API keys are read from env at call time and are NEVER logged.

export interface CallLlmOptions {
  system?: string;
  maxTokens?: number;
  json?: boolean;
  temperature?: number;
}

export interface CallLlmResult {
  text: string;
  provider: string;
}

const REQUEST_TIMEOUT_MS = 120_000;
const BACKOFF_MS = [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Marks an error as safe to retry (rate limit / transient server error). */
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

function isRetryableStatus(status: number): boolean {
  // 402: Pollinations uses "Payment Required" as its anonymous rate-limit
  // signal; backing off and retrying usually succeeds.
  return status === 402 || status === 408 || status === 429 || status >= 500;
}

function checkHttpStatus(res: Response, provider: string): void {
  if (res.ok) return;
  if (isRetryableStatus(res.status)) {
    throw new RetryableError(`${provider}: HTTP ${res.status} ${res.statusText}`);
  }
  throw new Error(`${provider}: HTTP ${res.status} ${res.statusText}`);
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  checkHttpStatus(res, new URL(url).hostname);
  return (await res.json()) as unknown;
}

/**
 * Pull the first JSON object/array out of possibly chatty LLM output
 * (strips markdown code fences first).
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[{[]/);
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('No JSON value found in LLM output');
  }
}

type ProviderFn = (prompt: string, opts: CallLlmOptions) => Promise<string>;

function withSystem(prompt: string, system: string | undefined): string {
  return system ? `${system}\n\n${prompt}` : prompt;
}

// ---------------------------------------------------------------- Gemini ---
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const geminiCall: ProviderFn = async (prompt, opts) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('gemini: GEMINI_API_KEY is not set');
  const fullPrompt = withSystem(prompt, opts.system);
  const body = {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const data = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(`gemini: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('gemini: empty response');
  return text;
};

// ------------------------------------------------------------- OpenRouter ---

function openAiChatBody(model: string, prompt: string, opts: CallLlmOptions): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });
  return {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  };
}

function openAiResponseText(data: unknown, provider: string): string {
  const parsed = data as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (parsed.error?.message) throw new Error(`${provider}: ${parsed.error.message}`);
  const text = parsed.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error(`${provider}: empty response`);
  return text;
}

// ------------------------------------------------------------- OpenRouter ---
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

const openRouterCall: ProviderFn = async (prompt, opts) => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('openrouter: OPENROUTER_API_KEY is not set');
  const siteUrl = process.env.SITE_URL || 'https://pawpilot.com';
  const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': siteUrl,
      'X-Title': 'PawPilot',
    },
    body: JSON.stringify(openAiChatBody(OPENROUTER_MODEL, prompt, opts)),
  });
  return openAiResponseText(data, 'openrouter');
};

// ------------------------------------------------------------------ chain ---
async function callWithRetry(name: string, fn: () => Promise<string>): Promise<string> {
  let lastErr: unknown = new Error(`${name}: unknown error`);
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof RetryableError;
      const last = attempt === BACKOFF_MS.length;
      console.warn(`[llm] ${name} attempt ${attempt + 1} failed: ${errMessage(err)}`);
      if (!retryable || last) break;
      const wait = BACKOFF_MS[attempt];
      console.log(`[llm] ${name}: retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/**
 * Call an LLM through the provider chain (Gemini -> OpenRouter).
 * Providers without keys are skipped. Returns the text and
 * the name of the provider that produced it. Throws only if ALL fail.
 *
 * NOTE: Pollinations was removed from the chain (2026-10-08) — their free
 * text and image APIs now return HTTP 402 (payment required).
 */
export async function callLLM(prompt: string, opts: CallLlmOptions = {}): Promise<CallLlmResult> {
  const chain: Array<{ name: string; configured: boolean; fn: ProviderFn }> = [
    { name: 'gemini', configured: !!process.env.GEMINI_API_KEY, fn: geminiCall },
    { name: 'openrouter', configured: !!process.env.OPENROUTER_API_KEY, fn: openRouterCall },
  ];
  const failures: string[] = [];
  for (const provider of chain) {
    if (!provider.configured) {
      console.log(`[llm] skipping ${provider.name} (no API key configured)`);
      continue;
    }
    try {
      const text = await callWithRetry(provider.name, () => provider.fn(prompt, opts));
      console.log(`[llm] ${provider.name} succeeded (${text.length} chars)`);
      return { text, provider: provider.name };
    } catch (err) {
      failures.push(`${provider.name}: ${errMessage(err)}`);
    }
  }
  throw new Error(`All LLM providers failed: ${failures.join(' | ')}`);
}
