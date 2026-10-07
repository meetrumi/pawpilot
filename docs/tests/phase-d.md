# Phase D — Admin Panel Test Report

**Date:** 2026-10-07 · **Machine:** this dev VM (Linux, Node v24.20.0, npm 10.9.4)
**Scope:** `lib/auth.ts`, `lib/admin/**`, `app/internal-admin/**`, `app/api/admin/**`,
`components/admin/**`, `types/*.d.ts`, plus the two authorized deps (`marked`, `turndown`).

## 1. Test environment

- Postgres: same instance as Phase A (`postgresql://postgres@localhost:5544/pawpilot_test`), verified up, schema + seed intact (6 categories, 1 author).
- `next dev --port 3111 --turbopack` with shell env:
  `DATABASE_URL`, `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD_HASH` (generated via `npm run hash-password`), `ADMIN_PATH=/paw-admin-7f3k2`.
- A second TOTP pass ran with `TOTP_SECRET` set (secret generated via otplib, kept out of logs).

## 2. Static checks (all green)

| Check | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` (`eslint`) | clean |
| build | `npm run build` (test DATABASE_URL) | green; all `/internal-admin/*` pages + `/api/admin/*` routes `ƒ (Dynamic)` |

Notes:
- One transient `tsc` failure during the run was caused by Phase C's temp file `scripts/__pp-cron-test.tmp.ts` appearing/disappearing mid-check (parallel phase); re-run clean, file gone.
- Next 16 + `cacheComponents`: `export const dynamic = 'force-dynamic'` is rejected by the build, so admin pages use `export const instant = false` (protected layout + login page) and admin API routes call `await connection()` inside `requireAdmin()` — all render request-time only, never prerendered.

## 3. Auth tests — 28/28 passed (`/tmp/phase-d-auth-tests.sh`)

| # | Test | Result |
|---|---|---|
| 1 | `GET /paw-admin-7f3k2/login` → 200, `noindex` meta, form rendered | PASS |
| 2 | `POST /api/admin/login` correct creds → 200 `{ok:true, csrf}` | PASS |
| 2 | `Set-Cookie`: name `paw-admin` (dev), `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Secure` in dev | PASS |
| 3 | `GET /api/admin/posts` with session cookie → 200 | PASS |
| 4 | `POST /api/admin/topics` with session but **no** `x-csrf-token` → **403** | PASS |
| 5 | Same with CSRF but invalid body → 400 (CSRF accepted, zod rejected) | PASS |
| 6 | `GET /paw-admin-7f3k2/` with session → 200 dashboard HTML | PASS |
| 7 | `POST /api/admin/logout` → 200, `Set-Cookie` cleared (`Max-Age=0`) | PASS |
| 8 | Old cookie after logout → 401 | PASS |
| 9 | Direct `/internal-admin/login` → 404; `X-Robots-Tag: noindex, nofollow` on admin path | PASS |
| 10 | Wrong password ×5 → 401 each; 6th attempt → **429** `{locked:true, retryAfterMs}` | PASS |
| 11 | `AdminLoginAttempt` rows: every attempt logged (27 rows after full suite), `ipHash` = 64-char sha256 hex | PASS |
| 12 | Unauthenticated dashboard → redirect to `/paw-admin-7f3k2/login`; unauthenticated API → 401 | PASS |

### TOTP (2FA) path — verified live with `TOTP_SECRET` set
- `GET /api/admin/totp-status` → `{"totpEnabled":true}` (leaks nothing about the secret); login form shows the authenticator-code field only then.
- Correct password **without** token → 401; with **wrong** token → 401; with **fresh valid** token → 200 + CSRF, subsequent authed API call → 200.
- Implementation note: otplib is **v13** — the `authenticator` object no longer exists, so verification uses the v13 functional API `verify({ secret, token, epochTolerance: 30 })` (`epochTolerance` is v13's drift option; a `window` option is silently ignored). Returns `result.valid`.

## 4. Functional API tests — 27/27 passed (`/tmp/phase-d-func2.sh`)

Posts: create (201, markdown→sanitized HTML, wordCount/readingTimeMin/contentText recomputed, tags connect-or-create) ·
duplicate slug → 409 · bad `scheduledFor` → 400 · PUT update → 200 · filtered list · detail GET ·
delete → 200.
Topics: create → 201 · approve → 200 · `move-top` reorders to first (updatedAt desc) · delete → 200.
Taxonomy: category/tag/author create → 201, duplicate slug → 409, delete → 200.
Media: multipart upload (PNG, 400×300) → 201 via Phase C `saveImageFromBuffer` (local `/uploads/2026/10/…`, Media row created) ·
GET list → 200 · DELETE → 200 + local file removed (best-effort).
Settings: GET → 200 with defaults · PUT partial → 200.
Inbox: GET → 200 · PATCH status → 200.
Agent: GET → 200 `{config, apiKeys (masked `••••1234`/`Not set`), runs}` ·
PUT settings: bad `agent_mode` → 400, bad `timezone` → 400.
Dashboard HTML: 200, contains Page views chart, Recent agent runs, Recent stage logs, Agent status.

**Agent Run/Retry integration (live, real pipeline):** `POST /api/admin/agent/run` lazily imported Phase C's
`lib/agent/pipeline.ts` and executed the real `runDailyAgent('manual')` — a genuine `AgentRun` row
(trigger `manual`, status `running`) appeared in the DB; a concurrent second call correctly returned the
pipeline's own `{"ok":false,"skipped":true,"reason":"job_locked"}`. The 501 graceful-degradation path
(used when the pipeline module is absent) is code-covered via `loadAgentPipeline()` try/catch; it was not
re-triggerable live because the pipeline now exists. `POST /api/admin/agent/retry` resets non-used topics
of failed runs to `approved` before invoking the pipeline (DB part verified; pipeline invocation same path).

**Editor round-trip** (`/tmp/test-editor-roundtrip.ts`): **21/21 checks passed** — markdown→marked→sanitize→turndown→marked→sanitize
preserves h1/h2/h3, ul/ol, bold/italic, links, tables (via a custom turndown GFM-table rule added in
`lib/admin/content.ts`, since turndown drops tables by default), blockquote, code blocks, wordCount/readingTime;
`<script>`, `onerror`, and `javascript:` URLs are stripped.

## 5. Cleanup

All test-created rows removed (posts, topics, categories, tags, authors, media + local file, contact message);
`Setting` rows touched by tests deleted so defaults apply; seed data untouched (6 categories, 1 author).
`AdminLoginAttempt` audit rows intentionally left (that table is append-only by design).

## 6. Deviations & decisions (for the docs phase)

1. **Cookie `Path=/`, not `Path=ADMIN_PATH`.** The spec asked for `path: ADMIN_PATH`, but the admin APIs live at
   `/api/admin/*` (also spec'd) — a browser will not send a `Path=/paw-admin-7f3k2` cookie to `/api/*`, which
   breaks *every* authenticated API call (verified: 401s until fixed). `Path=/` is also mandatory in production
   because the `__Host-` prefix requires `Path=/` (browsers reject otherwise), so this keeps dev/prod identical.
   `HttpOnly` + `SameSite=Strict` (+ `Secure` in prod) remain; the cookie is only useful on admin routes.
2. **otplib v13 API**: no `authenticator` object — uses functional `verify({secret, token, epochTolerance: 30})`.
3. **Deps added** (as authorized): `marked@18` (markdown→HTML) and `turndown@7` (HTML→markdown). Turndown ships no
   types → minimal ambient declaration in `types/turndown.d.ts` (type-only, not a new dep). No other new deps.
4. **`lib/storage.ts` integration**: Phase C's file landed mid-phase with exactly the contracted export
   `saveImageFromBuffer(buf, opts)`. The media upload route imports it statically (it exists now) and relies on it
   to create the `Media` row (it returns `mediaId`). Note: despite the name, the current implementation stores the
   original bytes (labeled `image/webp`) rather than re-encoding to WebP — Phase C's choice, surfaced here.
5. **`lib/agent/pipeline.ts` integration**: landed mid-phase with the exact signature `runDailyAgent(trigger: string)`.
   `loadAgentPipeline()` (`lib/admin/phase-c.ts`) does a literal `await import('@/lib/agent/pipeline')` in try/catch —
   verified Turbopack-safe at build time when the module was absent; an ambient `declare module` in
   `types/phase-c.d.ts` kept `tsc` green until the real file landed (module resolution prefers the real file).
6. **JWT key derivation**: `SHA256("pawpilot-admin-session:v1:" + ADMIN_PASSWORD_HASH)` — rotating the admin password
   changes the signing key, instantly invalidating all sessions (documented in `lib/auth.ts`).
7. **Topics "move to top"** = `PATCH {action:"move-top"}` sets `updatedAt = now()`; all queue lists order by
   `updatedAt` desc (documented in route + UI).
8. **md-editor CSS**: `@uiw/react-md-editor/markdown-editor.css` must be imported in the root `app/layout.tsx`
   (App Router only allows global node_modules CSS there); it only styles `.w-md-editor` markup, no public UI change.
9. **Next 16 `cacheComponents` learnings** (worth documenting): `dynamic = 'force-dynamic'` is a build error —
   use `export const instant = false` for request-time pages and `await connection()` (from `next/server`) at the
   top of dynamic route handlers; route-handler `params` is a `Promise`; `cookies()` is async.
10. **Shared test DB**: parallel phases (B/C) are actively testing on `pawpilot_test` (their AgentRuns/Media/JobLock rows
    were observed); admin tests used clearly-prefixed fixtures (`phase-d-*`) and cleaned up fully.
11. Not implemented (out of scope / deferred): login page CSRF is N/A (no session yet — the login response *returns*
    the CSRF token, and all subsequent mutations require the `x-csrf-token` header); `next dev` used for tests
    (dev cookie `paw-admin`, no `Secure` — prod uses `__Host-paw-admin` + `Secure`, code-branched on `NODE_ENV`).
