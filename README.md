# PawPilot 🐾

**PawPilot** — *"Happy pets, confident owners."* An automated, production-ready pet-care blog. An AI agent researches trending + evergreen pet topics, writes full-length articles (1500+ words), generates images, runs a 17-point QA gate, and publishes on a schedule — with a human review workflow by default.

Six categories: **dog-training**, **cat-care**, **breed-guides**, **pet-health**, **product-reviews**, **adventures**.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `cacheComponents`), React 19 |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg` + `pg`) |
| Styling | Tailwind CSS v4 |
| Auth (admin) | bcryptjs passwords, `jose` HS256 session JWTs, `otplib` TOTP 2FA, per-route CSRF tokens |
| Content | `marked` (markdown→HTML), `turndown` (HTML→markdown), `sanitize-html` |
| Images | `sharp` (WebP conversion), Supabase Storage or local `public/uploads` |
| AI | Gemini → Groq → OpenRouter → Pollinations fallback chain (all optional) |
| Deploy | Vercel (primary) + Vercel Cron, GitHub Actions backup cron |
| Scripts | `dev`, `build`, `typecheck`, `lint`, `db:migrate`, `db:deploy`, `db:seed`, `agent:run`, `hash-password` (see `package.json`) |

Key source files: `lib/agent/pipeline.ts` (agent orchestration), `app/api/cron/*/route.ts` (cron entry points), `lib/auth.ts` (admin auth), `prisma/seed.ts` (categories/author/pages + 5 starter posts).

## Local setup

Requirements: **Node.js ≥ 20** and a Postgres database (local Postgres, Supabase, or Neon).

```bash
# 1. Install dependencies (postinstall runs `prisma generate`)
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, SITE_URL, CRON_SECRET,
# ADMIN_PATH, ADMIN_USERNAME, ADMIN_PASSWORD_HASH (see "API keys & accounts" below)

# 3. Create tables
npx prisma migrate dev

# 4. Seed categories, author, pages (+ 5 starter posts via the agent pipeline)
npm run db:seed
# Core only (no starter posts):
npm run db:seed -- --core-only

# 5. Run
npm run dev   # → http://localhost:3000
```

Verify it works: `npm run typecheck`, `npm run lint`, `npm run build`.

## Production database

### Option A — Supabase (recommended: free Postgres + free Storage)

1. Create a project at [supabase.com](https://supabase.com) → **Project Settings → Database** → copy the **connection string** (use the pooled/Session mode URI if offered) into `DATABASE_URL`.
2. No SQL Editor work needed: `npx prisma migrate deploy` creates all tables from the Prisma migrations.
3. Storage: create a **public** Storage bucket named `images` (Storage → New bucket → Public). If you skip this, the app creates the bucket automatically via the Supabase REST API on first upload — but only when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set.
4. Copy the Project URL → `SUPABASE_URL` and the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). Never use the anon key here.

### Option B — Neon (free Postgres)

1. Create a project at [neon.tech](https://neon.tech) → copy the connection string into `DATABASE_URL`.
2. Run `npx prisma migrate deploy` to create tables. (Neon has no object storage — uploads fall back to `public/uploads`, which is **ephemeral on Vercel**, so pair Neon with Supabase Storage keys if you want persistent images.)

## API keys & accounts (all free)

The pipeline works with **zero API keys** — text and image generation fall back to the free Pollinations chain. Set keys to get better/faster models.

| Env var | Where to get it | Required? | What it does |
|---|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) | Optional | LLM #1 in the chain (`gemini-2.5-flash`) |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) | Optional | LLM #2 (`llama-3.3-70b-versatile`) |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) | Optional | LLM #3 (`meta-llama/llama-3.3-70b-instruct:free`) |
| `PEXELS_API_KEY` | [Pexels API](https://www.pexels.com/api/) | Optional | Fallback stock photos when Pollinations image generation fails |
| `RESEND_API_KEY` | [Resend](https://resend.com/api-keys) | Optional | Sends contact-form submissions as email (also needs `CONTACT_TO_EMAIL`) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API | Optional (effectively required in prod) | Persistent image storage. Dev falls back to local `public/uploads`; on Vercel local uploads are ephemeral, so set these in production |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | [@BotFather](https://t.me/BotFather) (new bot → token; then message the bot and read your chat id via `getUpdates`) | Optional | Ops alerts; key status shown in the admin agent panel |
| `INDEXNOW_KEY` | Generate any random string, e.g. `openssl rand -hex 16` | Recommended | Activates `/indexnow.txt` + auto-ping of new URLs on publish |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` | **Required** | Bearer token authorizing the `/api/cron/*` routes (Vercel Cron + backup workflow send it as `Authorization: Bearer <secret>`) |
| `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` | See below | **Required** | Admin login credentials |
| `ADMIN_PATH` | Pick a secret path, default `/paw-admin-7f3k2` | **Required** | Obscured admin URL prefix |
| `TOTP_SECRET` | Any authenticator app (generate a Base32 secret) | Optional | Enables TOTP 2FA on admin login |
| `CONTACT_TOKEN_SECRET` | Generate: `openssl rand -hex 32` | **Required** | HMAC secret for contact-form time-trap tokens. If unset, the app falls back to an ephemeral per-process secret — fine on one instance, invalid across multiple instances |
| `DATABASE_URL` | Supabase or Neon | **Required** | Postgres connection string |
| `SITE_URL` / `NEXT_PUBLIC_SITE_URL` | Your domain | **Required** | Canonical domain, no trailing slash (drives metadata, sitemap, canonical URLs, IndexNow host) |
| `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` | Your inbox | Only with Resend | Delivery address / sender identity for contact emails (sender defaults to `PawPilot <noreply@pawpilot.com>`) |
| GitHub secrets `CRON_SECRET` + `SITE_URL` | Repo → Settings → Secrets and variables → Actions | Only for backup cron | Used by `.github/workflows/backup-cron.yml` |

> Full per-account breakdown (free-tier limits, what breaks without each key): see **`ENV_ACCOUNTS.md`**.

## Admin credentials

```bash
# Generate a bcrypt hash (12 rounds). Prints ONLY the hash to stdout.
npm run hash-password -- --password 'YourStrongPasswordHere'
# Or pipe via stdin:
printf '%s' 'YourStrongPasswordHere' | npm run hash-password
```

Set in env:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...   # paste the full output of the command above
```

**Admin login URL:** `SITE_URL` + `ADMIN_PATH`, e.g. `https://pawpilot.com/paw-admin-7f3k2` → `/login`.

Admin security model (`lib/auth.ts`, `middleware.ts`):
- Password login + optional TOTP 2FA (`TOTP_SECRET`). Failed attempts are audited (`AdminLoginAttempt`) and rate-limited: 5 wrong attempts per IP+username in 15 minutes → 429 lockout.
- Session JWT (12 h) is signed with a key derived from `ADMIN_PASSWORD_HASH` — **rotating the admin password instantly invalidates all sessions**.
- Cookie is `__Host-paw-admin` in production (`Secure` + `Path=/` + `HttpOnly` + `SameSite=Strict`); all state-changing admin API calls additionally require an `x-csrf-token` header.
- The admin path is **never publicly linked**: it appears in no HTML, sitemap, `robots.txt`, or RSS; direct `/internal-admin` access returns 404; every admin response carries `X-Robots-Tag: noindex, nofollow`.

## Vercel deploy

1. Push the repo to GitHub → Vercel **Add New → Project → Import**.
2. In **Settings → Environment Variables**, add every variable from `.env.example` (see table above). Set at minimum: `DATABASE_URL`, `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `ADMIN_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `CONTACT_TOKEN_SECRET`, `INDEXNOW_KEY`, plus `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for persistent images.
3. Build settings: keep defaults (framework preset Next.js, build command `npm run build` → `next build`). `postinstall` runs `prisma generate` automatically.
4. **Database migrations:** add `prisma migrate deploy` to the build step — either set the Build Command to `npx prisma migrate deploy && npm run build`, or run it once from your machine with the production `DATABASE_URL` (`npx prisma migrate deploy`), or via the Vercel CLI after first deploy.
5. Seed production: run once with the production `DATABASE_URL` set locally: `npm run db:seed -- --core-only`.
6. Cron is declared in `vercel.json` and picked up automatically on deploy (see below). When `CRON_SECRET` is set, Vercel Cron requests include `Authorization: Bearer <CRON_SECRET>`, which the routes verify with a timing-safe comparison.
7. Deploy. Check `/sitemap.xml`, `/robots.txt`, `/rss.xml`, and `/indexnow.txt` (404 until `INDEXNOW_KEY` is set).

## Cron jobs

**Primary: Vercel Cron** (`vercel.json`) — no setup beyond deploy:

| Job | Schedule (UTC) | Route | What it does |
|---|---|---|---|
| Agent | `0 1 * * *` daily (06:00 Asia/Karachi) | `/api/cron/agent` | Researches topics, generates up to `posts_per_day` posts |
| Publisher | `*/10 * * * *` | `/api/cron/publish` | Promotes due `scheduled` posts → `published`, revalidates cache, pings IndexNow, adds backlinks |
| Refresh | `0 2 * * 0` Sundays (07:00 PKT) | `/api/cron/refresh` | LLM-refreshes the 3 stalest published posts |

All three require `Authorization: Bearer <CRON_SECRET>` (401 without it), use transactional `JobLock` rows so overlapping runs never double-execute (409 `job_locked` if a lock is held), and the agent route accepts `?mode=once` for a single manual cycle.

**Backup: GitHub Actions** (`.github/workflows/backup-cron.yml`) — same three jobs, same schedules, via `curl` with the secret from GitHub Actions secrets (`CRON_SECRET`, `SITE_URL`). Enable it so publishing continues if Vercel Cron ever stalls. Job locks make double-firing harmless, not harmful (the loser gets 409 `job_locked`).

Manual runs (same code paths as cron):

```bash
npm run agent:run -- --job=agent     # research + generate today's posts
npm run agent:run -- --job=publish   # publish due scheduled posts
npm run agent:run -- --job=refresh   # refresh stale posts
```

## Agent modes & publish schedule

Configured in the **admin panel → Agent → Settings** (stored in the `Setting` table; defaults in `lib/settings.ts`):

- **`agent_mode: review-first`** (default) — generated posts land as `review`; you approve, edit, and schedule from the admin panel. QA-failed posts always land here, in any mode.
- **`agent_mode: full-auto`** — QA-passed posts are scheduled automatically at the next free publish slot; you only touch exceptions.
- **`posts_per_day`**: 3 — **1 trending/news-jacking + 2 evergreen** topics per agent run.
- **`publish_times`**: `["09:00", "14:00", "19:00"]` in **`timezone`**: `Asia/Karachi` — computed with Intl tz math (`nextPublishSlots`), so slots stay correct across DST-free PKT.
- **`wordCountTarget`**: 1500 · **`tone`** and **`bannedWords`**: editable prompt/style controls · **`refreshEnabled`**: weekly refresh toggle.

Pipeline facts worth knowing: every post gets 1500–1800 words, exactly one H1, key-takeaways box, FAQ (FAQPage schema), 2 WebP images (featured + secondary), and a 17-point QA score (pass ≥ 75 + critical checks; up to 2 rewrites before landing in review). The writer adds a vet disclaimer automatically on pet-health posts and never copies SERP sentences (trigram originality checks).

## Search Console, Bing & IndexNow

1. **Set `INDEXNOW_KEY`** (e.g. `openssl rand -hex 16`). The app serves it at `https://YOURDOMAIN/indexnow.txt` and POSTs every newly published URL to `api.indexnow.org` with that key — no further setup.
2. **Google Search Console:** add a *Domain* property (DNS TXT verification at your registrar) or *URL prefix* property (HTML file upload to `public/`), then **Sitemaps → Add** → `https://YOURDOMAIN/sitemap.xml`. Use **URL Inspection** on a few posts to request indexing.
3. **Bing Webmaster Tools:** add the site (you can import it from Google Search Console in one click), submit the same sitemap URL. Bing honors IndexNow natively, so the auto-ping covers both.
4. Keep `robots.txt` as shipped (`Allow: /`, `Disallow: /api/` and `/search`, sitemap line) — the admin path is intentionally absent.

## Security notes

- **All secrets live in env only** — `.env` is never committed; `lib/auth.ts` is server-only and never bundled for the browser; the admin API-key panel returns masked hints (`••••1234` / `Not set`), never values.
- **`ADMIN_PATH` is a secret**, not a feature: default `/paw-admin-7f3k2` — change it to your own random path, never link it publicly, never set it to `/internal-admin` (direct access 404s by design).
- **CSP/AdSense caveat:** `middleware.ts` ships a strict `Content-Security-Policy` (`script-src 'self' 'unsafe-inline' 'unsafe-eval'`). The `AdSlot` component renders nothing until you set `ads_enabled=true` + `adsense_client_id` in admin Settings — and enabling AdSense **requires allowlisting `pagead2.googlesyndication.com` (and ad domains) in the CSP first**, otherwise the ad loader is blocked.
- **Contact form hardening:** HMAC time-trap token (`CONTACT_TOKEN_SECRET` — set it in production), honeypot field, 5 submissions/10 min per-IP rate limit, spam logged to DB with `status='spam'` instead of emailed.
- Cron endpoints are Bearer-token gated; admin login is brute-force audited and locked out; every response carries HSTS, `X-Frame-Options: DENY`, `nosniff`, strict `Referrer-Policy`, and CSP.

## Docs map

- `docs/research.md` — niche/brand/SEO strategy (Phase 0)
- `docs/tests/phase-a.md` … `phase-d.md` — test reports per phase
- `ENV_ACCOUNTS.md` — every account/key: where to get it, required vs optional, what breaks without it
- `.github/workflows/backup-cron.yml` — backup cron workflow
