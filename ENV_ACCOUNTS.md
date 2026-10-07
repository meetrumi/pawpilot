# PawPilot — Accounts & Environment Variables

Every account, key, and secret PawPilot needs. Set these in your hosting provider's
environment variables (Vercel: **Settings → Environment Variables**) or a local `.env`
copied from `.env.example`. **Never commit `.env`.**

The reconciled list below covers **every** `process.env.*` the codebase reads
(`app`, `lib`, `scripts`, `middleware.ts`), plus the Telegram keys the admin panel watches.
`NODE_ENV` is set by the framework itself and needs no action.

---

## Required — the site does not work without these

### Postgres database (`DATABASE_URL`)
- **Get it:** [Supabase](https://supabase.com) → Project Settings → Database → connection string,
  or [Neon](https://neon.tech) → project dashboard → connection string.
- **Free tier:** Supabase free project (small DB, 1 GB file storage); Neon free tier (0.5 GB storage,
  scale-to-zero compute). Limits change — check the provider's pricing page.
- **What breaks without it:** everything. Prisma cannot connect; pages, admin, agent, cron all fail.
  Run `npx prisma migrate deploy` once to create all 17 tables (+ GIN search index) from migrations.

### `SITE_URL` and `NEXT_PUBLIC_SITE_URL`
- **Get it:** your own domain registrar (research notes: pet `.com` is saturated — buy the best
  available variant; the codebase treats the domain as pure configuration). No trailing slash.
- **Free tier:** n/a (domain ~$10–15/yr).
- **What breaks without it:** wrong canonical URLs, OG tags, sitemap/robots/RSS host, IndexNow host
  resolution, and email link domains. Both must match, e.g. `https://pawpilot.com`.

### `CRON_SECRET`
- **Get it:** generate it yourself — `openssl rand -hex 32`. No account needed.
- **Free tier:** n/a.
- **What breaks without it:** all automation. `isCronAuthorized()` returns `false` when the secret is
  unset, so `/api/cron/agent`, `/api/cron/publish`, and `/api/cron/refresh` answer **401 to every
  request** — posts are never generated or published. Also required as a GitHub Actions secret for the
  backup workflow.

### `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`
- **Get it:** generate the hash yourself — `npm run hash-password -- --password 'YourStrongPasswordHere'`
  (prints only a `$2b$12$…` bcrypt hash). Pick any username.
- **Free tier:** n/a.
- **What breaks without it:** admin login is impossible (bcrypt compare against an empty hash fails).
  The session JWT signing key is derived from the hash (`SHA256("pawpilot-admin-session:v1:" + hash)`),
  so **changing the password instantly invalidates all admin sessions**.

### `ADMIN_PATH`
- **Get it:** invent it — a random, unguessable path, e.g. `/paw-admin-7f3k2`. The code defaults to
  `/paw-admin-7f3k2` if unset, but you should set your own.
- **What breaks without it:** nothing technically (the default applies), but the default is public
  knowledge — **rotate it** and never link it anywhere. Never set it to `/internal-admin`
  (direct access to `/internal-admin` is hard-404'd by `middleware.ts`).

### `CONTACT_TOKEN_SECRET`
- **Get it:** generate it yourself — `openssl rand -hex 32`.
- **What breaks without it:** the contact form still works on a **single** server instance, but the
  HMAC time-trap token falls back to an ephemeral per-process secret (`lib/http.ts`) — tokens issued
  by one instance (or before a restart) are rejected by others, and legitimate submissions get
  400 "That was fast — …" errors. **Set this in any multi-instance or serverless production deploy**
  (Vercel included).

---

## Recommended

### `INDEXNOW_KEY`
- **Get it:** generate any random string — `openssl rand -hex 16`. No account needed.
- **What breaks without it:** nothing breaks, but new posts are not pushed to search engines instantly.
  With the key set, the app serves it at `/indexnow.txt` (404 when unset) and POSTs every published URL
  to `api.indexnow.org` on publish (`lib/indexnow.ts`). Covers Bing/Yandex natively; harmless for Google.

---

## Optional — LLM providers (the pipeline works with zero keys)

The writer/research/QA chain tries **Gemini → OpenRouter → Pollinations** (`lib/agent/providers.ts`),
with 1s/2s/4s backoff on 402/408/429/5xx. Missing keys are simply skipped.

### `GEMINI_API_KEY`
- **Get it:** [Google AI Studio](https://aistudio.google.com/apikey) → "Create API key" (no card required).
- **Free tier:** generous free quota on `gemini-2.5-flash` (per-minute/daily limits; check AI Studio quotas).
- **Used for:** TEXT (writer/research/QA chain) **and IMAGES** — when set, the pipeline generates both post images with `gemini-2.5-flash-image` (primary image provider; falls back to Pollinations, then Pexels on any failure).
- **What breaks without it:** text chain starts at OpenRouter instead; images use Pollinations. Nothing fails.

### `OPENROUTER_API_KEY`
- **Get it:** [OpenRouter](https://openrouter.ai/keys) → "Create API Key".
- **Free tier:** `:free`-suffixed models (used: `meta-llama/llama-3.3-70b-instruct:free`) cost nothing.
- **What breaks without it:** chain falls through to Pollinations. Nothing fails.

### Zero-key mode (Pollinations)
- **Get it:** nothing — no account, no key.
- **Behavior:** text via `text.pollinations.ai`, images via `image.pollinations.ai` (seeded, nologo).
  Anonymous text calls are capped (~600–900 words/response) so the writer assembles articles from
  base + continuation calls, and HTTP 402 rate-limits are treated as retryable — the full E2E pipeline
  was proven on this chain with no keys (see `docs/tests/phase-c.md`).
- **Trade-off:** slower and more rate-limit-prone than the keyed providers; add at least one LLM key
  for production reliability.

---

## Optional — images & storage

### `PEXELS_API_KEY`
- **Get it:** [Pexels API](https://www.pexels.com/api/) → "Get started" → API key (free).
- **Free tier:** 200 requests/hour, 20,000 requests/month.
- **What breaks without it:** image generation is Pollinations-only; Pexels stock-photo fallback is skipped.

### `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **Get it:** [Supabase](https://supabase.com) → your project → Settings → API → Project URL + `service_role` key.
  Never use the `anon` key here.
- **Free tier:** included in the Supabase free project (1 GB storage).
- **What breaks without it:** uploads fall back to local `public/uploads/YYYY/MM/` — fine in local dev,
  but **Vercel's filesystem is ephemeral**, so uploaded images vanish on redeploy/scale. Treat these as
  **effectively required in production**. When set, images go to the public `images` bucket, which the
  app creates via the Supabase REST API if it doesn't exist. A `Media` DB row is always recorded either way.

---

## Optional — email & alerts

### `RESEND_API_KEY`
- **Get it:** [Resend](https://resend.com/api-keys) → "Create API Key".
- **Free tier:** 100 emails/day (3,000/month) — check current pricing.
- **What breaks without it:** contact-form submissions are still stored in the DB (Inbox), but no email
  is sent — the route logs `[contact] message stored (RESEND_API_KEY/CONTACT_TO_EMAIL unset — no email sent)`.

### `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`
- **Get it:** your own inbox address.
- **What breaks without it:** without `CONTACT_TO_EMAIL` (and `RESEND_API_KEY`) no contact email is sent.
  `CONTACT_FROM_EMAIL` defaults to `PawPilot <noreply@pawpilot.com>` — set it to a verified Resend sender
  identity to avoid spam-folder delivery.

### `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- **Get it:** message [@BotFather](https://t.me/BotFather) → `/newbot` → token; message your new bot,
  then read your chat id from `https://api.telegram.org/bot<TOKEN>/getUpdates`.
- **Free tier:** Bot API is free and effectively unlimited.
- **What it does:** `lib/alerts.ts` sends a Telegram message on pipeline failures — failed/partial
  `daily-agent` runs, failed `refresh` runs, and failed `publish` items. When unset, alerting is a
  safe no-op (nothing breaks). Key status is also shown in the admin agent panel.

### `TOTP_SECRET`
- **Get it:** generate a Base32 secret with any authenticator app (1Password, Google Authenticator, etc.).
- **What breaks without it:** nothing — admin 2FA stays off. With it set, login additionally requires a
  valid TOTP code (verified via otplib v13 `verify({ secret, token, epochTolerance: 30 })`).

---

## Backup-cron GitHub secrets

For `.github/workflows/backup-cron.yml` only (repo → **Settings → Secrets and variables → Actions**):

| Secret | Value | Notes |
|---|---|---|
| `CRON_SECRET` | same value as the Vercel env var | Sent as `Authorization: Bearer` on every curl |
| `SITE_URL` | `https://your-domain.com` | Target host for the three cron endpoints |

---

## Quick reference — everything in one place

| Env var | Required? | Where to get it |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase / Neon dashboard |
| `SITE_URL`, `NEXT_PUBLIC_SITE_URL` | Yes | Your domain registrar |
| `CRON_SECRET` | Yes | `openssl rand -hex 32` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | Yes | `npm run hash-password -- --password '…'` |
| `ADMIN_PATH` | Yes (secret) | Invent a random path |
| `CONTACT_TOKEN_SECRET` | Yes | `openssl rand -hex 32` |
| `INDEXNOW_KEY` | Recommended | `openssl rand -hex 16` |
| `GEMINI_API_KEY` | Optional | https://aistudio.google.com/apikey |
| `OPENROUTER_API_KEY` | Optional | https://openrouter.ai/keys |
| `PEXELS_API_KEY` | Optional | https://www.pexels.com/api/ |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Optional (prod: yes) | Supabase project → Settings → API |
| `RESEND_API_KEY` | Optional | https://resend.com/api-keys |
| `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | With Resend | Your inbox |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Optional (failure alerts) | https://t.me/BotFather |
| `TOTP_SECRET` | Optional | Authenticator app |
