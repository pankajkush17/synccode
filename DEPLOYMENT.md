# Deployment Guide — Free Hosting

## Architecture

```
Browser → Vercel (Next.js web)
              ↕
         Render (sync WebSocket server)
              ↕              ↕
         Supabase        Upstash
         (Postgres)      (Redis)
```

Never commit real secrets. Generate `EDIT_SECRET` with `openssl rand -hex 32` and
paste it straight into Render's environment settings.

---

## Step 1 — Supabase (Postgres)

1. Create a project at https://supabase.com
2. Open **Connect** (or Settings → Database) and pick **Transaction pooler**
   - It looks like:
     `postgresql://postgres.[ref]:[password]@aws-1-[region].pooler.supabase.com:6543/postgres`
   - Use the pooler, not the direct `db.[ref].supabase.co` host: the direct host
     is IPv6-only and Render's free tier cannot reach it (`ENETUNREACH`).
   - URL-encode special characters in the password (`$` → `%24`, `@` → `%40`).

---

## Step 2 — Upstash (Redis)

1. Create a Redis database at https://upstash.com
2. Copy the Redis URL and change the scheme to `rediss://` (TLS):
   `rediss://default:[password]@[host].upstash.io:6379`

---

## Step 3 — Render (sync WebSocket server)

1. New → **Blueprint** → select the repo; Render reads `render.yaml`
2. Fill in the prompted variables:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | pooler URI from Step 1 |
   | `REDIS_URL` | `rediss://` URL from Step 2 |
   | `EDIT_SECRET` | output of `openssl rand -hex 32` |
   | `ALLOWED_ORIGINS` | your Vercel URL(s), comma separated, or `*` |

3. Wait for **Live**; note the URL, e.g. `https://synccode-sync.onrender.com`

---

## Step 4 — Vercel (Next.js web app)

1. Import the repo and set **Root Directory** to `apps/web`
2. Environment variables:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_SYNC_WS_URL` | `wss://synccode-sync.onrender.com` |
   | `SYNC_HTTP_URL` | `https://synccode-sync.onrender.com` |
   | `NEXT_PUBLIC_SITE_URL` | your Vercel URL |

3. Deploy. If the WebSocket fails to connect, check that the exact origin you
   browse from is listed in `ALLOWED_ORIGINS` on Render.

---

## Staying awake on the free tier

Render sleeps a free service after ~15 minutes without inbound traffic.

- **Self-ping:** the sync server reads `RENDER_EXTERNAL_URL` (set by Render
  automatically) and requests its own `/readyz` every 10 minutes
  (`KEEPALIVE_INTERVAL_MS`). The request goes out through Render's edge and back
  in, so it counts as traffic, and `/readyz` runs `SELECT 1` plus a Redis `PING`,
  so Supabase and Upstash see activity too (Supabase pauses free projects after
  a week idle). Off everywhere else unless `KEEPALIVE_URL` is set.
- **Daily backstop:** a Vercel Cron job (`apps/web/vercel.json`) calls
  `/api/keepalive` once a day, which wakes the sync server if it ever did fall
  asleep (for example after a missed ping).

One always-on service uses ~730 of Render's 750 free instance hours per month,
so keep only one free service awake.
