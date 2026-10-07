// Masked API-key status for the admin agent panel.
// Server-side only. Never returns full secret values — only whether each key
// is set, plus the last 4 characters as a "which key is this" hint.

export interface ApiKeyStatus {
  label: string;
  envNames: string[];
  set: boolean;
  hint: string; // "Not set" | "Set (••••1234)"
}

const WATCHED_KEYS: Array<{ label: string; envNames: string[] }> = [
  { label: 'Gemini', envNames: ['GEMINI_API_KEY'] },
  { label: 'Groq', envNames: ['GROQ_API_KEY'] },
  { label: 'OpenRouter', envNames: ['OPENROUTER_API_KEY'] },
  { label: 'Pexels', envNames: ['PEXELS_API_KEY'] },
  { label: 'Resend', envNames: ['RESEND_API_KEY'] },
  { label: 'Supabase', envNames: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { label: 'Telegram', envNames: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
];

export function getApiKeyStatuses(): ApiKeyStatus[] {
  return WATCHED_KEYS.map(({ label, envNames }) => {
    const values = envNames
      .map((name) => process.env[name])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (values.length === 0) {
      return { label, envNames, set: false, hint: 'Not set' };
    }
    const first = values[0];
    return {
      label,
      envNames,
      set: true,
      hint: `Set (••••${first.slice(-4)})`,
    };
  });
}
