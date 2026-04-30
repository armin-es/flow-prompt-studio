# Tech-stack rationale + suggestions

> Reference doc capturing **why the current stack is right** for this project, what one piece is missing, and the explicit trade-off vs Next.js. The README today doesn’t make these choices visible; the “Trade-offs to put in the README” section at the bottom is the short version to lift up there when ready.

---

## Current stack

```
React 19 + TypeScript 6 + Vite 8 + Zustand 5      ← UI (SPA, port 5173)
Hono 4 + @hono/node-server + zod + openai         ← API (separate process, port 8787)
Vitest 3                                          ← tests
ESLint 10 + typescript-eslint 8                   ← lint
Vercel (UI) + Render (API)                        ← deploy targets
```

Two-process dev:

```
npm run dev = concurrently { vite (5173) , tsx watch server/index.ts (8787) }
   └─ Vite proxies /api/* → 127.0.0.1:8787  (vite.config.ts)
```

This keeps the LLM key out of the browser bundle **by construction** (it never enters Vite’s build), not by convention.

---

## Why each choice is right (and what to *say* about it)

### React 19 + Zustand
- Hard problem here is **coordinating multiple stores under high-frequency updates**: `graphStore`, `executionStore`, `portPositionStore`, `runResultStore`, `historyStore`, `wireStore`, `runOutputCacheStore`.
- Zustand’s `store.subscribe()` lets non-React code (a rAF port-position batcher) react to viewport changes **without going through React render**. That’s the whole basis of the M5A pan-perf story (panning a 200-node graph doesn’t re-render the node tree).
- React Context can’t do this; Redux Toolkit can but with much more ceremony.
- **Sticky.** No reason to change.

### Vite 8
- ~150 LOC of bundler config, instant HMR, smallest bundle for a SPA.
- The “server” concern (LLM calls) is already handled by a separate process, so we don’t need a meta-framework for routing.
- **Sticky.**

### Hono
- Tiny, web-standards-based: `Request`/`Response` + `streamSSE`. Runs identically on Node, Bun, Cloudflare Workers, Vercel functions.
- The streaming endpoint earns its keep:
  - Native `AbortSignal` propagation: client disconnect → `c.req.raw.signal` aborts → cancels the OpenAI stream in **4 lines**, not the 30-line `req.on('close')` middleware stack you get in Express.
  - Web-standards `streamSSE` instead of hand-rolling `text/event-stream`.
- **Sticky.**

### Two-process dev (Vite + Hono)
- API key isolation by construction.
- Fast restart loops on either side independently.
- Vite proxy makes it look like one origin during development; same-origin in production via Vercel rewrites or a reverse proxy.
- **Sticky.**

### Zod
- Already on the boundary (`/api/complete` validates body with `completeSchema`).
- Same library will power the **WidgetSpec → runtime validation** path when the registry refactor lands (see `06-node-registry-pr.md`).
- **Sticky.**

---

## The one stack-level gap

**Embeddings provider is hard-coded.** Once `AppRetrieve` (see `05-real-node-design.md`) lands with the optional cosine path, `server/index.ts` will call `openai.embeddings.create` directly. A reviewer will read that and conclude “welded to OpenAI.”

Fix is one ~30 LOC file:

```ts
// server/providers/embed.ts
export interface EmbedProvider {
  name: string
  embed(texts: string[], signal: AbortSignal): Promise<number[][] | null>
  // returns null if provider is unavailable (no key, etc.) so the executor can fall back to BM25
}

export function selectEmbedProvider(): EmbedProvider {
  const key = process.env.OPENAI_API_KEY
  if (key) return openAIEmbedProvider(key)
  return nullEmbedProvider // returns null → BM25 fallback in the AppRetrieve executor
}
```

Three properties to preserve:

1. `null` is a first-class “no provider” return, not an exception. The Retrieve executor downgrades to BM25 deterministically.
2. The provider receives the abort `signal` from `c.req.raw.signal`, same shape as `/api/complete/stream`.
3. `selectEmbedProvider` is called per-request, not per-process — keeps env-var flips reflective during dev without restart.

Out of scope until later: registry of providers, per-graph provider override, local model providers (e.g. Ollama). Those are easy to add to this shape; we just don’t need them yet.

---

## Should the project switch to Next.js?

**No.** Not for any reason that survives a careful reading of this codebase. Detail below so the answer holds up under questioning.

### What Next.js would *give* this app

1. One deployable instead of two.
2. File-based API routes (`app/api/complete/route.ts`).
3. Server Components + streaming UI (unused here).
4. Image / font / metadata helpers (unused here).
5. Cosmetic familiarity to reviewers who don’t look closer.

### What Next.js would *cost* this app, concretely

1. **Real refactor work for zero user-visible win.**
   - Every interactive component (NodeComponent, EdgeLayer, Toolbar, Inspector, GraphEditor) needs `"use client"`. None of the screens are SSR-able anyway because a graph editor is fundamentally interactive.
   - URL-handling for `?demo=…` happens client-side today; same in Next, just with extra ceremony around `useSearchParams`.

2. **The streaming story gets *worse*, not better.**
   - On Vercel’s default function tier, **functions time out at 10s** (free) / 60s (hobby) — long before a real LLM stream finishes. SSE *can* be done but constantly bumps into that ceiling.
   - On the Edge runtime, `openai` SDK behaviour changes (no Node `Buffer`, no `fs`, different abort plumbing). You re-test everything.
   - The current setup — Hono on a long-lived Render process — has **no per-request timeout**, and `c.req.raw.signal` already plumbs abort cleanly. This is the more reliable path for SSE token streaming. Switching is a regression.

3. **Bundle bloat.**
   - Current production bundle is ~150 KB gzipped (Vite + React 19, no router framework).
   - Next 15’s minimum runtime overhead — router, RSC payload — is bigger than the entire current bundle, even if you write zero server components. Pure tax for an SPA.

4. **The performance story gets harder to tell.**
   - Today: “I subscribed to viewport changes from non-React code via Zustand and rAF-batched into a port-position store, so panning 200 nodes doesn’t re-render the node tree.” — readable, distinctive.
   - Next equivalent: same code with `"use client"` on top. The interesting observation is now buried in a framework idiom and reads as less deliberate.

### When Next.js *would* be the right call

- Multi-page surfaces (`/gallery`, `/docs`, `/about`). Not the case.
- Per-user persistence with auth (NextAuth integration is shorter than rolling your own). Explicitly chose `localStorage` for v1.
- Edge runtime for low-latency regional UI. Bottleneck here is the model call, not the network edge.
- Heavy SEO requirements. Not the case.

### Anti-pattern to avoid

Reaching for Next.js because it “looks more modern.” A reviewer who knows what they’re doing reads `Vite + Hono + Zustand` on a graph editor as **someone who chose tools by fit**, and reads `Next.js App Router` on the same project as **someone who reaches for Next reflexively**. The current stack is the more sophisticated choice for this problem; the README just needs to say so.

---

## Trade-offs to put in the README (short form)

Drop a small **“Stack choices and trade-offs”** subsection into the README, with three bullets. Suggested wording:

- **Vite over Next.js.** Single-page, fully interactive editor; no SSR-able screens. Keeping the API on a long-lived Hono process avoids serverless timeouts on token-streamed completions. Trade-off: two deployables instead of one.
- **Hono over Express/Fastify.** Web-standards `Request`/`Response` + `streamSSE`; native `AbortSignal` propagation makes the LLM-cancel path 4 lines instead of 30. Same code can later move to Bun / Workers / Vercel functions without rewriting handlers.
- **Zustand over Redux Toolkit / React Context.** Non-React subscribers (a rAF batcher reading viewport changes into `portPositionStore`) are how panning stays cheap on a 200-node graph. Redux can do this; Context can’t. Trade-off: less devtools polish than Redux.

Keep these explicit. The current README is too humble about stack choices — a reviewer skimming it can’t tell whether they were deliberate.

---

## Dependency additions worth making (only when needed)

Only when the corresponding work lands:

| When | Add | Cost | Why |
|---|---|---|---|
| With registry PR (`06-…`) | `tiny-invariant` (~150 B) | runtime | Drift catchers in registry: `invariant(spec.widgets.length === spec.defaultWidgets.length, …)`. |
| With roadmap #2 (tests) | `@testing-library/react` + `@testing-library/user-event` | dev only | Editor integration tests (drag-to-connect, Add palette, From here disabled state). |
| With roadmap #2 (smoke) | `@playwright/test` | dev only | One smoke test for `?demo=joinllm` end-to-end. |
| With #5 cosine path | (no new dep — uses existing `openai`) | — | Embeddings via the same SDK already pinned for completions. |

Nothing else is justified by current scope. Resist adding `react-flow`, `xyflow`, `dagre`, `elkjs`, animation libs, or UI kits — the differentiator of this project is that the editor is hand-built; importing those collapses the story.

---

## What this means for sequencing

Order to ship:

1. **Registry PR** (`06-node-registry-pr.md`) — refactor only, no behaviour change.
2. **`EmbedProvider` interface** — single 30-line file, lands with or just before #5.
3. **`AppRetrieve`** (`05-real-node-design.md`) — one new file under `src/nodes/`.
4. **README rewrite** with trade-offs section + GIF + Mermaid diagram (roadmap #7).
5. **CI badge + Playwright smoke** (roadmap #2 + #4).

Steps 1–3 are coding. Step 4 is the one that flips the project from “a person built this” to “a person built this *and knows why they built it this way*” — which is the whole point of the doc set under `docs/`.
