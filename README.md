# Flow Prompt Studio

Node **graph editor** (Input → **LLM** → Output) with a tiny **Hono** API. The default is the app pipeline; `?demo=comfy` loads the old simulated ComfyUI workflow, and `?stress=N` loads a long **Stress** chain (default 200) for pan/zoom profiling.

## Deploy (public URL)

Step-by-step **Vercel UI + Render API**: **[DEPLOY.md](./DEPLOY.md)** (echo mode works without `OPENAI_API_KEY`). After deploy, add your live link here and in the repo About section.

## Run (client + API)

```bash
git clone https://github.com/armin-es/flow-prompt-studio.git
cd flow-prompt-studio
npm install
npm run dev
```

- **Vite** serves the UI and **proxies** `/api` to `http://127.0.0.1:8787`. **`npm run dev` waits** until the API port is listening before starting Vite, so you should not see `http proxy error: ECONNREFUSED` on the first load.
- Copy `.env.example` to **`.env`** and set `OPENAI_API_KEY` for real completions. If the key is missing, the API **echoes** the prompt (still proves the wireup).

### API authentication (optional)

When **`AUTH_SECRET`** (≥32 chars) **and** **`AUTH_PASSWORD`** (≥8 chars) are set in `.env`, the UI shows a **sign-in** screen and all **`/api/*`** routes except **`/api/health`** and **`/api/auth/*`** require a **session cookie** or **`Authorization: Bearer <API_AUTH_TOKEN>`** (if `API_AUTH_TOKEN` is also set). Omit these variables for local dev without a gate.

Split UI/API hosts need matching **`CORS_ORIGINS`** (your site origin) and, on HTTPS, consider **`AUTH_COOKIE_SECURE=1`**.

`npm run dev:client` runs only the UI (completions need `/api` elsewhere or will fail for LLM steps).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite + API (`concurrently`) |
| `npm run build` | Client production build |
| `npm run test` | Unit tests (Vitest) |
| `npm run typecheck:server` | Typecheck `server/index.ts` |
| `npm start` | API only (production-style; `PORT` from env) |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle + Postgres (Stage B); `db:up` starts Docker; `db:migrate` / `db:studio` run `db:up` and **wait** until the DB port accepts connections (avoids `ECONNREFUSED` right after `compose up`) |

## URL query params

| Param | Example | Effect |
|--------|---------|--------|
| (none) | `/` | Default app graph; may **restore** from `localStorage` (`flow-prompt-v1`) |
| `demo` | `?demo=comfy` | Comfy simulation on first load |
| `demo` | `?demo=topology` | **Tee/Join** demo: fan-out and fan-in (TEXT only) |
| `demo` | `?demo=pick` | **Pick 2→1** demo: two sources, one chosen output |
| `demo` | `?demo=joinllm` | **Join+LLM**: two **AppInput**s → **AppJoin** → **AppLlm** → **AppOutput** |
| `demo` | `?demo=rag` | **RAG**: Question → **Tee** → **Retrieve** + **Join** → **AppLlm** → **AppOutput** (BM25 retrieval needs no key; LLM may echo without key) |
| `stress` | `?stress=150` | Stress test graph with **N** chained nodes (capped in code) |

## Toolbar (quick)

- **App pipeline** / **Tee/Join** / **Pick 2→1** / **Join+LLM** / **RAG** / **Comfy demo** / **Stress 200** — **Tee/Join**, **Pick**, and **Retrieve** can run with no API. **RAG** uses **BM25** (in-browser ranking over an in-node corpus) by default; **cosine** uses **`POST /api/embed`** (needs `OPENAI_API_KEY` on the server). The **LLM** step in **RAG** still uses the same completion route as other presets (echo without a key). **Join+LLM** is two sources merged, then the model, then **Output** (real completions need a key like **App pipeline**). **Stress** is for many nodes + edges.
- **Add** (second row) — spawns **Input**, **LLM**, **Output**, **Join**, **Tee**, **Prefix**, **Pick**, or **Retrieve**; then wire ports manually.
- **Import JSON** — Flow **v1** export (`version: 1`, nodes/edges) or ComfyUI workflow JSON.
- **Export** — downloads the current graph as JSON (same shape as import v1).
- **Fit** / **Run** / **From here** — fit view; **Run** walks the full DAG; **From here** re-runs the **selected** node and everything **downstream**, using **cached** upstream outputs (after a successful full run; **upstream** nodes must be unchanged since that run, but you can still edit the selected or downstream nodes). See *Technical challenges → Run (partial)*.

## Keyboard

Ignored while focus is in a text field (prompt/system), per `isTypableFieldFocused()`.

| Key | Action |
|-----|--------|
| **F** | Fit all nodes in view |
| **Esc** | While running: cancel (including in-flight **LLM** `fetch` via `AbortController`). Otherwise clear node selection. |
| **Arrows** | Nudge selected node(s) by 1px (8px with **Shift**) |
| **⌘/Ctrl+Z** | Undo |
| **⌘/Ctrl+Shift+Z** | Redo |
| **⌘/Ctrl+A** | Select all nodes |
| **⌘/Ctrl+C** / **⌘/Ctrl+V** | Copy / paste selected subgraph (in-app clipboard) |
| **Delete** / **Backspace** | Remove selected nodes (and their edges) or selected edges |

**Canvas**

- **Shift+drag** on empty canvas — **marquee** (box) select; **⌘/Ctrl** while releasing adds to selection.
- **Drag** from an **output** port to an **input** port — new edge; mismatched port types are rejected.
- **Add** (toolbar, second row) — places a new app node near the **center of the view**; wire it in with drag-from-port (same as above). You can start from an empty graph this way, or add to a loaded preset.
- **⌘/Ctrl+click** a node — toggle in selection. **Shift+click** — add to selection.
- **Pan** — drag empty background. **Scroll** — zoom at pointer.

## Persistence

- The graph (nodes, edges, selection) is **debounced to `localStorage`** (`flow-prompt-v1`). Clear site data or use another profile to get a clean default.
- **Export** / **Import** round-trip the same JSON shape for backups and sharing.

### Server persistence (Postgres, optional)

For **Stage B** the API can use **Drizzle + PostgreSQL** when `DATABASE_URL` is set (see [`.env.example`](./.env.example)).

1. **Either** `npm run db:up` **or** `docker compose up -d` (image includes **pgvector**; port **5433** in [`docker-compose.yml`](./docker-compose.yml); service uses **`restart: unless-stopped`** so it comes back with Docker).
2. `DATABASE_URL=postgresql://flow:flow@127.0.0.1:5433/flow_prompt` in `.env`, then `npm run db:migrate` (this script starts the container and **waits** for Postgres before migrating).
3. `npm run db:studio` — same: starts DB if needed, waits, then opens Drizzle Studio (usually **https://local.drizzle.studio**).
4. `GET /api/health` includes **`database: true`** when the pool connects.

**Client flags** (Vite, rebuild after changing):

- `VITE_SYNC_SERVER=1` — after load, **pull** named corpora from the server (newer `updatedAt` wins); if the API is up and **`GET /api/corpora` is empty**, **push all local corpora from IndexedDB** so Postgres fills on first run; on each edit, **push**; toolbar shows **Save to server** / **Load from server** for the graph JSON. Requires **`DATABASE_URL`** in the **same** `.env` the **Node** API loads (not only the browser). Also **disables** the client embed vector store **`flow-prompt-embed-v1`** (embeddings stay in memory for the tab only). **Named corpora** still use **`flow-prompt-corpora-v1`** in IndexedDB as a local cache unless you later add a full server-only mode.
- **`VITE_SERVER_COSINE_RETRIEVE=1`** (optional) — same as above for cosine-only; **not needed** if you already set **`VITE_SYNC_SERVER=1`**. With server cosine preferred, **successful** runs do not write to the browser **`flow-prompt-embed-v1`** store. After corpus sync, run **`POST /api/corpora/:id/embed`** so chunk vectors exist in Postgres. If server retrieve **fails**, the run **throws** (no silent client cache) unless you set **`VITE_COSINE_CLIENT_FALLBACK=1`** to allow in-browser cosine (IndexedDB may grow). Use **bm25** in the Retrieve widget to avoid any browser embedding work.

**Use `X-User-Id: dev`** (default) for the single-user path until Clerk (Stage C). All new routes are under the same Hono app (`/api/graphs*`, `/api/corpora*`, `/api/retrieve`, `/api/runs`).

## UI panels

- **Node inspector** (right column, when one app node is selected) — mirror prompt/system fields.
- **Last run** — status, **run id**, timing, and final text; echoes cancellation message if you stop during a run.

## Technical challenges (frontend)

- **Screen vs graph space:** `viewportMath.ts` + `useViewport` keep pan, zoom, drags, and edge endpoints consistent; covered by **Vitest** for the pure math.
- **Edges:** Port centers measured in the layout, converted to **graph** space, cached in `portPositionStore` so the SVG layer stays in sync with nodes and zoom. The **graph node layer** sits **above** the edge `<svg>` in `z-index` so static Bézier hit targets don’t steal clicks from **ports**. The **in-flight** draft wire (`.wire-draft`) is excluded from the same `pointer-events: stroke` rule as finished edges, so a drop reaches `[data-input-port]` to complete a connection; otherwise the **draft path** (z=3) would be the `elementFromPoint` target on release.
- **Run pipeline:** Topological execution; per-node `executionStore`; `runResultStore` for the panel; LLM node calls **`POST /api/complete/stream`** (SSE, OpenAI token stream) with **abort** on cancel; Hono + Zod, **no API key in the client**. **Retrieve** runs **BM25** locally, optional **cosine** in-browser via **`POST /api/embed`**, or with **`VITE_SYNC_SERVER=1` / `VITE_SERVER_COSINE_RETRIEVE=1`**, **cosine** over **`POST /api/retrieve`** (Postgres + pgvector) without client embed cache unless **`VITE_COSINE_CLIENT_FALLBACK=1`**. **rAF** batches partial text into the store so the canvas does not repaint on every chunk.
- **Run (partial):** After a run, the engine saves **port outputs** and a **per-node content stamp** (type + `widgetValues`). A wire from *outside* the downstream slice into it is valid only if that **source** node’s stamp still matches the saved one—so changing only the **LLM** (or any downstream) does not invalidate cached **Input** data. **Run from here** seeds upstream values from that cache. Vitest covers downstream reachability, fingerprints, and partial-run validation.
- **A11y:** **Skip to graph** link, `main` + canvas `application` role with a short description, `aria-label` on primary toolbar actions and on prompt/system text areas, and friendlier error hints in the Last run panel.
- **Input routing:** Global shortcuts defer to `isTypableFieldFocused()` so typing in a node does not move the canvas.
- **Editor semantics:** History snapshots + explicit commits; **Add** spawns `createAppNode` at viewport center; multi-select, marquee, drag-to-connect, **Delete** to remove, and clipboard round out authoring on the graph.
- **Resilience:** React **error boundary** at the app root; optional **VITE_API_ORIGIN** for split deploys (see [DEPLOY.md](./DEPLOY.md)).
- **Layout:** Port rows aligned in Comfy style (tight label + socket groups).
- **Large graphs (M5A):** Pan/zoom should not re-render every node; see [Performance (M5A)](#performance-m5a).

## Behavior (app pipeline)

1. Edit **Input** and optional **System** on the **LLM** node, then **Run**.
2. **Last run** and the **Output** node show the final `TEXT` when the run finishes.
3. `?demo=comfy` on first load swaps in the Comfy simulation (`main.tsx`).

### App TEXT node types (topology demos)

All use **TEXT** ports like **Input** / **LLM** / **Output** so you can mix them in a graph:

| Type | I/O | Role |
|------|-----|------|
| **AppTee** | 1→2 | Fan-out: same text to **out A** and **out B** |
| **AppJoin** | 2→1 | Fan-in: concat **a** and **b** with a **separator** string |
| **AppPrefix** | 1→1 | Prepend a **Prefix** string |
| **AppPick** | 2→1 | Pass through wire **0** or **1** (widget), ignoring the other |
| **AppRetrieve** | 1→1 | **Query** (TEXT in) → top-**K** passages (TEXT out) with **Passage [n] — [title (¶k)]** + citation / **I don’t know** for the **LLM**; **named corpora** (text in **IndexedDB**, id in the node; **Edit corpus** supports **drop or browse** for `.md` / `.txt` / `.json`); **paragraph-first** chunking; **chunk** / **overlap** in **widgets**; **bm25** / **cosine** + **IndexedDB** embed cache (`.env.example`) |

Presets: toolbar **Tee/Join** (diamond), **Pick 2→1** (two `AppInput` → `AppPick` → `AppOutput`), **Join+LLM** (task + context → `AppJoin` → `AppLlm` → `AppOutput`), and **RAG** (tee + retrieve + join + LLM, `?demo=rag`).

## Deploy (production)

Static UI + Node API. Set **`VITE_API_ORIGIN`** at build time and **`CORS_ORIGINS`** on the server when origins differ. See [`DEPLOY.md`](./DEPLOY.md), [`vercel.json`](./vercel.json), [`render.yaml`](./render.yaml). **`GET /api/health`** returns `ok` + `service` for uptime checks.

### Video + resume (ship checklist)

1. **60–90s:** default graph → edit → **Run** → result panel → pan/zoom → optional **Esc** to cancel; optionally show **Stress** and **undo**.
2. **One-line resume (tune to taste):** *Node-based prompt pipeline (React, TypeScript, Zustand): graph editor with graph-space port/edge layout, DAG execution with per-node state and a Hono+OpenAI step (no key in the client), editor features (undo, wiring, persistence), and a perf pass on large graphs (React Profiler + stress graph).*

## Performance (M5A)

**Problem:** Every `NodeComponent` subscribed to `viewport` so **pan and zoom re-rendered all visible nodes** (e.g. 200 after **Stress 200**), even when node data was unchanged.

**Change:** Remove that subscription. Re-measure port dots and write **`portPositionStore`** from a per-node **`useGraphStore.subscribe`** (fires only on viewport field changes) plus **`requestAnimationFrame`**, and on position/size changes. **Pan/zoom no longer re-renders** `NodeComponent` instances; edges still get fresh endpoints via the port store. **`EdgeLayer`** (one SVG) still re-renders on viewport, which is cheap relative to 200 nodes.

**Where to profile:** [React DevTools](https://react.dev/learn/react-developer-tools) → **Profiler** tab in Chrome/Edge (not inside this repo; install the browser extension, open the app, then use **⚛️ Profiler**).

**How to verify (same as in interviews)**

1. Load **Stress 200** or `?stress=200`.
2. **Profiler** → start recording → **pan** 2–3s → stop.
3. **Expected:** `NodeComponent` **~0 commits** while panning (not O(nodes)); commits cluster on the edge/inspector layer and store updates, not 200× node re-renders.
4. Optional: add **your** machine’s note here (e.g. “~X ms scripting while panning” from **Performance** → **Main** or Profiler rank) — varies by hardware, so treat as anecdotal, not a benchmark.

## Roadmap (later)

- Vector DB / persistent corpus / hybrid reranking — partly addressed by Stage B (Postgres + pgvector); further notes kept outside this repo.
- **Pause / approval** node (block the run until the user continues) — not in v1; **Run from here** is the supported way to redo work from a chosen node.
- Further perf: virtualize or simplify edge updates if profiling still shows a bottleneck.
- E2E tests — optional; not required for the portfolio story.

## Stack

Vite, React 19, TypeScript, Zustand, Hono, OpenAI (optional), Zod, Vitest.

**Interview story:** [INTERVIEW-technical-challenge-pitch.md](./INTERVIEW-technical-challenge-pitch.md)
