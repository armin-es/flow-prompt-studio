# Deploy — Flow Prompt Studio (Milestone 3)

The app is **two parts**: a static **Vite** UI and a **Node** Hono API. In development, Vite **proxies** `/api` to the API. In production, the UI is usually a **different origin** from the API, so the client is built with `VITE_API_ORIGIN` and the server allows the UI in `CORS_ORIGINS`.

## 1. API (Hono on Render, Fly, Railway, etc.)

1. Create a **Web Service** (Node 20+), connect this repo, **root** `projects/flow-prompt-studio` if the repo is the notes monorepo.
2. **Build command:** `npm install` (or `cd projects/flow-prompt-studio && npm install`).
3. **Start command:** `npm start` (runs `tsx server/index.ts`).
4. **Port:** the server reads `PORT` from the host (Render sets this automatically). Default locally is `8787`.
5. **Environment variables:**

   | Name | Required | Purpose |
   |------|----------|---------|
   | `OPENAI_API_KEY` | Recommended | Real model output; if empty, the API **echoes** the prompt. |
   | `CORS_ORIGINS` | **Yes in prod** | Comma- or space-separated list of **browser** origins, e.g. `https://your-app.vercel.app`. If unset, only localhost (5173, 4173) is allowed. |
   | `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
   | `PORT` | Optional | Injected by most hosts. |

6. **Health check:** set the path to `/api/health` (returns `{ "ok": true, "service": "flow-prompt-studio" }`).

See [`render.yaml`](./render.yaml) for an example **Render** blueprint (adjust **root** if needed).

## 2. UI (Vercel, Netlify, Cloudflare Pages, etc.)

1. **Build command:** `npm run build` (from `flow-prompt-studio` root).
2. **Output directory:** `dist`.
3. **Environment variables (build time):**

   | Name | Required | Purpose |
   |------|----------|---------|
   | `VITE_API_ORIGIN` | **Yes** if the API is not same-origin | Public **origin** of the API only, e.g. `https://flow-prompt-api.onrender.com` — no path, no trailing slash. |

4. The repo includes [`vercel.json`](./vercel.json) (SPA rewrites to `index.html` + long cache for `assets/`).

**After the API URL is known:** set `CORS_ORIGINS` on the server to the **exact** UI origin (e.g. `https://flow-prompt.vercel.app`) and rebuild the UI with `VITE_API_ORIGIN` pointing at the API. Order: deploy API first → copy URL → set CORS on API → set `VITE_API_ORIGIN` on static host → redeploy UI.

## 3. Checklist

- [ ] `GET https://<api>/api/health` returns 200 and JSON.
- [ ] `POST https://<api>/api/complete` works from the browser (or curl with `Origin: https://<ui>`) once CORS matches.
- [ ] The deployed UI loads, **Run** completes (LLM or echo if no key).

## 4. Video + resume (you)

- Record 60–90s: default graph, edit prompt, **Run**, result panel, pan/zoom, **Escape** to cancel.
- Add one line to your resume / LI aligned with the repo README (see main README “Resume (one line)”).
