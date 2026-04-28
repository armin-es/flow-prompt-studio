# Deploy — public UI + API URL

The app is **two deployables**:

| Part | Role | Typical host |
|------|------|----------------|
| **UI** | Static Vite build (`dist/`) | **Vercel**, Netlify, Cloudflare Pages |
| **API** | Node + Hono (`npm start`) | **Render**, Railway, Fly.io |

Local dev uses one origin with Vite proxying `/api`. In production the UI usually calls a **different origin**, so you set **`VITE_API_ORIGIN`** at **build time** on the static host and **`CORS_ORIGINS`** on the API to the **exact** UI origin (scheme + host + port if any).

**Echo mode:** If **`OPENAI_API_KEY`** is unset on the API, `/api/complete` returns `[echo / no OPENAI_API_KEY] …` — enough to prove deploy without secrets.

---

## Order of operations

1. Deploy the **API** and note its public origin (e.g. `https://flow-prompt-studio-api.onrender.com`).
2. Set **`CORS_ORIGINS`** on the API to your future UI origin(s), e.g. `https://flow-prompt-studio.vercel.app` (add preview URLs if you want PR previews to work).
3. Deploy the **UI** with **`VITE_API_ORIGIN`** set to that API origin (no path, no trailing slash).
4. Open the UI URL, run a graph — completions should work (LLM if key set, else echo).

---

## 1. API on Render

1. [Dashboard](https://dashboard.render.com/) → **New** → **Web Service** → connect **`armin-es/flow-prompt-studio`** (or your fork).
2. **Root directory:** leave empty if the repo root **is** this project; otherwise set the subfolder where `package.json` lives.
3. **Runtime:** Node **20+**.
4. **Build command:** `npm install` (or `npm ci` if you prefer lockfile-only installs).
5. **Start command:** `npm start`
6. **Health check path:** `/api/health`
7. **Environment variables:**

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `CORS_ORIGINS` | **Yes** for browser UI | e.g. `https://your-app.vercel.app` — comma/space-separated list of allowed **browser** origins. Without this, only localhost dev origins work. |
   | `OPENAI_API_KEY` | No | Omit for echo-only demos. |
   | `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
   | `DATABASE_URL` | No | Stage B Postgres + pgvector; omit if you only need completions/embeddings without persistence. |
   | `AUTH_SECRET` / `AUTH_PASSWORD` | No | Optional gate; if set, see README “API authentication” and set **`AUTH_COOKIE_SECURE=1`** on HTTPS. |

8. Deploy and copy the service **URL**.

Optional: use [`render.yaml`](./render.yaml) via **Blueprint** (same env names; set secrets in the dashboard).

**Smoke test:**

```bash
curl -sS "https://<YOUR_API_HOST>/api/health"
```

Expect JSON with `"ok": true` and `"database": …`, `"auth": …`.

---

## 2. UI on Vercel

1. [Vercel](https://vercel.com/) → **Add New…** → **Project** → import **`armin-es/flow-prompt-studio`** (or fork).
2. Framework preset **Vite** should match [`vercel.json`](./vercel.json) (`framework`, `buildCommand`, `outputDirectory`).
3. **Environment variables** (Production — and Preview if you want previews to hit the API):

   | Name | Value |
   |------|--------|
   | `VITE_API_ORIGIN` | `https://<YOUR_API_HOST>` — API origin only, no `/api` suffix |

4. Deploy and open the **`.vercel.app`** URL (or your custom domain).

**Smoke test:** Load the app, add **App pipeline** (or a preset), **Run** — you should see text (model or echo).

---

## 3. CLI alternative (Vercel)

If you use the Vercel CLI locally (`npm i -g vercel`):

```bash
cd flow-prompt-studio
vercel login
vercel link
vercel env add VITE_API_ORIGIN production   # paste API origin when prompted
vercel --prod
```

---

## 4. PostgreSQL + pgvector (`DATABASE_URL`)

Persistence (graphs, corpora, chunk embeddings, runs) needs **PostgreSQL** with the **`vector`** extension (**pgvector**). The API applies Drizzle migrations **on startup** when `DATABASE_URL` is set (`runMigrationsIfNeeded` in `server/db/client.ts`).

### Requirements

- Postgres **14+** with **`CREATE EXTENSION vector`** allowed (migration `0000_init.sql` creates it).
- Connection string in **`DATABASE_URL`** (single URL, typically with **`sslmode=require`** for cloud hosts).

### Local (Docker)

From the repo root:

```bash
docker compose up -d
npm run db:migrate
```

Set in **`.env`** (same values as `docker-compose.yml`):

```env
DATABASE_URL=postgresql://flow:flow@127.0.0.1:5433/flow_prompt
```

Restart **`npm run dev`** (or **`npm run dev:server`**). **`GET /api/health`** should show **`"database": true`**.

### Hosted options (production API)

Use any managed Postgres that ships **pgvector** (or lets you enable it). Examples:

| Provider | Notes |
|----------|--------|
| **[Neon](https://neon.tech/)** | Enable **pgvector** in project settings; copy pooled connection string; append **`?sslmode=require`** if not already present. |
| **[Supabase](https://supabase.com/)** | Postgres includes pgvector — **must use Direct or Session URI** (see below). **Do not** use the transaction pooler on port **6543** for this API. |
| **[Render Postgres](https://render.com/docs/databases)** | Create a **PostgreSQL** instance and link it to your Web Service so **`DATABASE_URL`** is injected — confirm **`vector`** extension is available (Postgres 15+ images often work; if migration fails, use Neon/Supabase instead). |

#### Supabase: Direct vs pooler

The **`pg`** driver uses **prepared statements**. Supabase **transaction pooler** (**port 6543**) does **not** support them, so **`POST /api/retrieve`** (and similar queries) can fail with **500**.

Use **`DATABASE_URL`** from:

- **Project Settings → Database → Connection string → URI**, using **Direct connection** (`db.<project-ref>.supabase.co`, port **5432**), **or**
- **Session pooler** if shown (port **5432** on the pooler host) — **not** transaction mode **6543**.

### Wire the API (e.g. Render)

1. Create the database and copy the **connection URI**.
2. On the **API** service → **Environment** → add **`DATABASE_URL`** (paste URI; add **`?sslmode=require`** if the provider expects SSL and it’s missing).
3. **Save** and redeploy. Watch logs: migration runs once at boot; errors usually mean wrong URL or missing pgvector.
4. **`curl https://<api>/api/health`** → **`"database": true`**.

### Wire the UI (Vercel)

Rebuild the static site with server sync enabled so the toolbar can save graphs/corpora to Postgres:

| Variable | Value |
|----------|--------|
| **`VITE_SYNC_SERVER`** | **`1`** |

Keep **`VITE_API_ORIGIN`** set to your Render API. Redeploy after changing env vars.

### Optional

- **`SKIP_AUTO_EMBED=1`** on the API — skip background embedding after corpus writes (saves OpenAI calls during tests).

---

## 5. Checklist

- [ ] `GET https://<api>/api/health` → 200 JSON.
- [ ] `CORS_ORIGINS` on the API includes the exact Vercel UI origin (scheme + host).
- [ ] `VITE_API_ORIGIN` on Vercel matches the API origin used in the browser.
- [ ] UI loads, **Run** finishes (OpenAI output or echo).
- [ ] If using Postgres: **`"database": true`** on **`/api/health`** and **`VITE_SYNC_SERVER=1`** on Vercel when you want server persistence.

---

## 6. Troubleshooting

- **CORS errors in the browser console:** `CORS_ORIGINS` must include the UI’s origin string-for-string (`https://foo.vercel.app` ≠ `https://www.foo.vercel.app`).
- **`401 Unauthorized` on `/api/*`:** API has **`AUTH_SECRET`** + **`AUTH_PASSWORD`** set; either sign in through the UI or unset auth vars for a public echo demo.
- **`fetch failed` / wrong API:** Confirm `VITE_API_ORIGIN` was set **before** the last UI build (Vite inlines env at build time).
- **`DB migration failed` / `connect ENETUNREACH` to an IPv6 address (`2600:…`) — Render (and many hosts) often has no working **IPv6 egress**, while `db.*.supabase.co` can resolve to IPv6 first. **Fix:** On the API service, add environment variable **`NODE_OPTIONS`** = **`--dns-result-order=ipv4first`** so Node prefers IPv4 when connecting to Postgres. Redeploy. (Alternative: Supabase **IPv4 add-on** or a host that supports IPv6 — rarely needed if `ipv4first` works.)
