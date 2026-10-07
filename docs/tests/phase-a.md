# Phase A — Test Report

**Date:** 2026-10-07 · **Machine:** this dev VM (Linux, Node v24.20.0, npm 10.9.4)

## 1. Postgres test setup (exact steps — reuse for later phases)

The `apt-get download postgresql` route was attempted but `apt-get update` stalled on slow mirrors, so the working path was **`pip install pgserver`** (bundles real PostgreSQL 16.2 binaries, no Docker needed).

```bash
# 1. Install pgserver (bundles PostgreSQL 16.2 binaries)
pip install --break-system-packages pgserver
PGHOME=/usr/local/lib/python3.12/dist-packages/pgserver/pginstall

# 2. Fix permissions so a non-root user can traverse/execute
#    (wheel ships dirs as drwxrwx--- and .so files without o+r)
chmod a+rx /usr/local/lib/python3.12/dist-packages/pgserver \
            /usr/local/lib/python3.12/dist-packages/pgserver.libs
chmod -R a+rX $PGHOME
chmod a+r /usr/local/lib/python3.12/dist-packages/pgserver.libs/*

# 3. Non-root user (initdb refuses root)
useradd -m -s /bin/bash pgtest   # already exists as uid 1000

# 4. Data dir. NOTE: chown is blocked on the ~/workspace filesystem,
#    so the real data dir lives on /tmp (tmpfs, chown works) and
#    ~/workspace/.pg-test/data is a symlink to it.
mkdir -p /tmp/pgtest-data && chown pgtest:pgtest /tmp/pgtest-data
mkdir -p ~/workspace/.pg-test/{run,log}
ln -s /tmp/pgtest-data ~/workspace/.pg-test/data

# 5. initdb as pgtest (binaries carry RPATH to pgserver.libs, no LD_LIBRARY_PATH needed)
runuser -u pgtest -- $PGHOME/bin/initdb -D /tmp/pgtest-data -E UTF8 --auth=trust -U postgres

# 6. Start on port 5544 (socket dir /tmp; pgtest cannot write into ~/workspace/.pg-test/run)
runuser -u pgtest -- $PGHOME/bin/pg_ctl -D /tmp/pgtest-data -l /tmp/pgtest-data/logfile \
  -o "-p 5544 -k /tmp" start

# 7. Create databases
runuser -u pgtest -- $PGHOME/bin/createdb -h localhost -p 5544 -U postgres pawpilot_test
runuser -u pgtest -- $PGHOME/bin/createdb -h localhost -p 5544 -U postgres pawpilot_fresh
```

**Test DATABASE_URL (trust auth, no password):**

```
postgresql://postgres@localhost:5544/pawpilot_test
```

`pawpilot_fresh` was used once to prove `db:deploy` applies cleanly; both DBs persist on the running instance.

**Gotchas recorded:**
- `pg_ctl stop`: `runuser -u pgtest -- $PGHOME/bin/pg_ctl -D /tmp/pgtest-data stop`
- The server does NOT survive a VM reboot (data dir is on tmpfs). To restart: re-run steps 5–7 (initdb needed again after reboot since /tmp is wiped).
- Free /tmp before initdb: a stale 481 MB scaffold copy initially caused "No space left on device".

## 2. Test results (all green)

| Check | Command | Result |
|---|---|---|
| Prisma client gen | `npx prisma generate` | OK |
| Migration create+apply | `prisma migrate dev` (DB: pawpilot_test) | OK — `20261007133020_init` incl. hand-appended `post_search_gin` GIN index |
| GIN index present | SQL on `pg_indexes` | `post_search_gin` on `"Post"` confirmed |
| Fresh deploy | `npm run db:deploy` (DB: pawpilot_fresh) | OK — 17 tables, GIN index present |
| Seed core | `npm run db:seed -- --core-only` | 6 categories, 1 author (`maya-khan`), 4 pages |
| Seed idempotency | re-ran `--core-only` + SQL counts | still 6 / 1 / 4, no duplicates |
| Seed full mode (no pipeline) | `npm run db:seed` (Phase C pipeline absent) | exits 1 with clear "implement Phase C first" message |
| typecheck | `npm run typecheck` | clean |
| lint | `npm run lint` | clean |
| build | `npm run build` (dummy `DATABASE_URL`) | green; no live DB touched at build time |
| hash-password (flag) | `npm run hash-password -- --password '…'` | `$2b$12$…`, `bcrypt.compareSync` verifies, wrong password rejected |
| hash-password (stdin) | `echo '…' \| tsx scripts/hash-password.ts` | valid `$2b$12$` hash; empty input → clean error, exit 1 |
| Shared libs smoke | tsx script vs live DB | `getSetting`/`setSetting` round-trip, `getAgentConfig` defaults (`review-first`, 3/day, `["09:00","14:00","19:00"]`, `Asia/Karachi`, 1500 words), `readingTimeMinutes(1500)=8`, `formatDate` → "October 7, 2026", `slugify` correct, rate limiter denies 3rd hit in window with `retryAfterMs > 0` |
| Middleware (dev server) | curl | `/` → 200 + HSTS/X-Frame-Options-DENY/nosniff/Referrer-Policy/CSP; `/internal-admin` → 404; `/paw-admin-7f3k2` → rewrite → 404 + `X-Robots-Tag: noindex, nofollow`; `/api/*` → `X-Robots-Tag: noindex, nofollow` |

## 3. Known deviations / notes for later phases

- `lint` script is `eslint`, not `next lint` — Next 16 removed the `next lint` command.
- `middleware.ts` uses the deprecated Next 16 `middleware` convention (still executes; upstream renamed it to `proxy.ts`). Build prints the deprecation notice; behavior verified working.
- Prisma 7 breaking changes handled: datasource URL moved to `prisma.config.ts`; `PrismaClient` requires a driver adapter → added `@prisma/adapter-pg` + `pg` (+ `@types/pg` dev). `lib/db.ts` is a lazy singleton: no env read and no connection until first use, so `next build` needs no live DB.
- `npm install prisma` initially resolved the `8.0.0-rc.21` prerelease; pinned back to stable `prisma@7` to match `@prisma/client@7.10.0`.
- `scripts/agent-run.ts` does NOT exist yet — only the `agent:run` npm script entry is registered. Phase C must create it before running.
- Tailwind v4 is wired via the scaffold's `@tailwindcss/turbopack` CSS loader; `@tailwindcss/postcss` + `postcss` are installed per spec but not the active pipeline.
