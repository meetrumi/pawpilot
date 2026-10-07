# Phase B — Test Report

**Date:** 2026-10-07 · **Machine:** this dev VM (Linux, Node v24.20.0, npm 10.9.4)
**Test DB:** `postgresql://postgres@localhost:5544/pawpilot_test` (server was already running; restarted check only)
**Site under test:** `next dev` on `:3000` with `SITE_URL`/`NEXT_PUBLIC_SITE_URL=http://localhost:3000`

> Context: Phase C (`app/api/cron/**`, `lib/agent/*`) and Phase D
> (`app/internal-admin/**`, `app/api/admin/**`) are being built concurrently by
> other agents. Their files were mid-write during this phase and do not yet
> typecheck. All checks below were run against the **Phase B scope**; the full
> tree will be green once those phases land.

## 1. Static checks

| Check | Command | Result |
|---|---|---|
| typecheck (Phase B scope) | `npx tsc --noEmit` in an isolated copy excluding other phases' in-progress files (`app/api/cron`, `app/api/admin`, `app/internal-admin`, `lib/agent/*` except `types.ts`, `lib/admin`, `scripts/agent-run.ts`) | **CLEAN** |
| typecheck (full tree) | `npm run typecheck` | Blocked by Phase C WIP: `app/api/cron/*/route.ts` (pipeline `claimJobLock`/`releaseJobLock` arity), `lib/agent/qa.ts` (`stripTags`), `lib/agent/writer.ts` (`text` redeclare), `lib/agent/images.ts` (`alt` missing). Zero errors in Phase B files. |
| lint | `npm run lint` | **CLEAN** (one error found & fixed during the phase: `react-hooks/set-state-in-effect` in `ShareButtons` — refactored to take the canonical URL as a server-computed prop, no client state) |
| build | `npm run build` in the isolated Phase B copy (dummy `DATABASE_URL`, no live DB) | **GREEN** — 22 routes, incl. `/`, `/post/[slug]`, `/category/[slug]`, `/author/[slug]`, `/search`, `/sitemap.xml`, `/robots.txt`, `/rss.xml`, `/indexnow.txt`, `/opengraph-image`, `/post/[slug]/opengraph-image` |

### Framework deviations (Next 16 + `cacheComponents: true`)

The spec's literal `export const dynamicParams = true`, `export const revalidate = 3600`,
and `generateStaticParams() => []` **error the build** under Cache Components
(per `node_modules/next/dist/docs`: route-segment `dynamic`/`dynamicParams`/`revalidate`/`fetchCache`
removed; empty `generateStaticParams()` raises `empty-generate-static-params`). Used the documented equivalents:

- Dynamic routes (`post/[slug]`, `category/[slug]`, `author/[slug]`, `/search`): `export const instant = false`
  (segment allowed to block; on-demand render) — no `generateStaticParams`.
- Hourly revalidation: `'use cache'` + `cacheLife('hours')` in every `lib/data.ts` reader
  (build route table shows `1h` revalidate), plus `cacheTag('posts'|'categories'|'pages'|'authors'|'settings')`
  so Phase C can `revalidateTag()` on publish.
- No `new Date()`/`Date.now()` during prerender (build error): footer year via cached helper
  (`use cache` + `cacheLife('days')`); sitemap drops `lastModified: now` for static/category entries
  (posts keep real `updatedAt`); post page compares date strings.
- OG images (Satori): multi-child `<div>`s need explicit `display:flex`; `-webkit-box` line-clamp
  unsupported — titles truncated in JS instead.

## 2. Live tests (`next dev` + curl)

One published test post inserted via Prisma
(`phase-b-test-puppy-biting-guide`, FAQ + takeaways + secondary image configured),
plus 12 extra posts for pagination (13 total in `dog-training`). **All 13 posts,
2 contact messages, 1 subscriber, 1 pageview deleted after tests** (verified count 0).

| Check | Result |
|---|---|
| `GET /` | 200, hero + tagline, latest grid, 6 category cards, newsletter form, trust signals |
| Post page: single H1 | exactly 1 `<h1` |
| Post page: Article JSON-LD | present |
| Post page: BreadcrumbList JSON-LD | present |
| Post page: FAQPage JSON-LD (FAQ present) | present |
| Post page: TOC links ↔ heading ids | `#why-puppies-bite`, `#bite-inhibition-basics`, `#redirection-that-works`, `#when-to-call-a-trainer` all match injected `id`s (desktop sticky nav + mobile `<details>`) |
| Post page: canonical | `<link rel="canonical" href="http://localhost:3000/post/phase-b-test-puppy-biting-guide"/>` |
| Post page: OG tags | `og:title/description/url/site_name/image(→per-post opengraph-image)/image:width/height/alt` all present |
| Post page: secondary image | `<figure>` + `https://example.com/puppy-toy.jpg` inserted right after the "Redirection that works" H2 |
| Post page: extras | key-takeaways box ✓, disclosure banner ✓, author box linking `/author/maya-khan` ✓, publish date + reading time ✓, FAQ `<details>` ×2 ✓, share hrefs (X/Facebook/WhatsApp/Telegram) ✓ |
| Category `?page=2` | 200, 1 post (13 total / 12 per page) |
| Category: `rel="prev"` link tag | present in `<head>` (React 19 hoisting verified in served HTML), `href` = canonical page-1 URL |
| Category: canonical page 1 | `/category/dog-training` — no `?page=1` anywhere on page 1 |
| Category: canonical page 2 | self-referencing `?page=2` |
| `/sitemap.xml` | 25 `<url>`s; test post listed with `<lastmod>2026-10-07…</lastmod>`; categories + static pages present |
| `/robots.txt` | `Allow: /`, `Disallow: /api/`, `Disallow: /search`, `Sitemap:` URL; no admin path |
| `/rss.xml` | 13 `<item>`s incl. test post; valid RSS 2.0 shape |
| `/search?q=puppy` | `<meta name="robots" content="noindex, nofollow"/>`; full-text search returned the test post (GIN index path exercised) |
| `/indexnow.txt` (key unset) | 404, empty body |
| `/opengraph-image` and post og image | 200, `image/png` |
| `/author/maya-khan` | 200, Person JSON-LD, bio, post list |
| `/about` | 200 (Page model content) |
| Unknown route | 404, branded "This trail went cold" page |
| Contact: fresh token POST (time-trap) | 400 "That was fast — …" (token <3s old) |
| Contact: honeypot filled | 200 `{"ok":true}`; DB row `status='spam'` ✓ |
| Contact: legit (token aged 4s) | 200 `{"ok":true}`; DB row `status='new'` ✓ |
| Contact: rate limit | 5/10min per IP via `lib/rate-limit` (limiter unit-verified in Phase A); not exhaustively re-probed here |
| Newsletter: subscribe | 200 "Welcome aboard!" |
| Newsletter: duplicate | 200 "You are already subscribed. 🐾" (no second row) |
| Newsletter: invalid email | 400 "Enter a valid email address" |
| `POST /api/view` | 204; `PageView` row `{path, postId}` in DB ✓ |
| Admin-path disclosure | `paw-admin-7f3k2`/`internal-admin` appear **0×** in `/`, post, category, search, about, contact HTML, robots.txt, and sitemap.xml |

## 3. Seed change (additive)

`prisma/seed.ts`: added the missing **`contact`** Page (the spec's `/contact` reads from the Page model)
and fixed stale `/page/disclaimer` → `/disclaimer`, `/page/terms` → `/terms` links in seeded HTML.
Re-ran `npm run db:seed -- --core-only` → 6 categories / 1 author / **5 pages**, idempotent (re-run: no duplicates).

## 4. Notes for the docs phase

- **Phase C publish hook:** call `revalidateTag('posts')` (and `'categories'`/`'pages'` as appropriate;
  `'settings'` for ad/newsletter-adjacent toggles) from `next/cache` after publish — tags are already wired in `lib/data.ts`.
- **Prod env to set:** `SITE_URL` (+ `NEXT_PUBLIC_SITE_URL`), `DATABASE_URL`, `CONTACT_TOKEN_SECRET`
  (else an ephemeral per-process secret is used — fine single-instance, wrong multi-instance),
  `RESEND_API_KEY` + `CONTACT_TO_EMAIL` (+ optional `CONTACT_FROM_EMAIL`) for contact emails,
  `INDEXNOW_KEY` to activate `/indexnow.txt`, `ads_enabled=true` + `adsense_client_id` to enable ads.
- **Ads CSP caveat:** `middleware.ts` (Phase A, do-not-touch) restricts `script-src`; enabling AdSense
  requires allowlisting `pagead2.googlesyndication.com` (and ad domains) in the CSP, else the
  `AdSlot` loader is blocked. `AdSlot` renders nothing unless both settings are set (default off).
- **No new dependencies** added. `sanitize-html` available but unused by Phase B (content is written sanitized by Phase C).
- Test Postgres left running on `:5544`; test DB contains no Phase B test rows (all deleted).
