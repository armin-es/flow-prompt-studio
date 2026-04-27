# 08 — From RAG demo to RAG product

> **Goal.** Flow Prompt Studio becomes a real, multi-tenant tool for **building grounded LLM workflows on your own documents**, not just a graph editor with a clever Retrieve node.
>
> **Speed.** No rush. Staged so each milestone is mergeable on its own and ships value at the end of every stage.
>
> **Differentiator stays the editor.** Persistence and auth exist to make the editor’s outputs (graphs, runs, corpora) shareable and survivable, not to compete with notewise-ai-ts as a chat product.

This document is the canonical roadmap once `05-real-node-design.md` is shipped. Read after `06-node-registry-pr.md` and `07-tech-stack-rationale.md`.

---

## What we already have (anchor)

- `AppRetrieve` node (BM25 default, optional cosine via `/api/embed`).
- Per-node corpus stored in `widgetValues[1]` (string, ≤ 64 KB).
- LLM completions via `/api/complete` + `/api/complete/stream` (Hono on a long-lived process).
- Graph state persisted to **`localStorage`** (`flow-prompt-v1`).
- No auth. No database. No file ingest. No citations in the answer.

This works as a portfolio demo, but you can’t honestly say *I use this on my own notes*. The rest of this plan fixes that.

---

## What we reuse from notewise-ai-ts

You already paid for these patterns; we lift them where they fit, not the product around them.

| From notewise-ai-ts | Reuse here |
|---|---|
| **Drizzle ORM** + migrations | Same pattern; new schema. |
| **PostgreSQL + pgvector** with HNSW index on `embedding vector(1536)` | Identical for the chunks table. |
| **Clerk** auth | Same provider, same envs, same dev account if you want. |
| **AI SDK** (`@ai-sdk/openai`) for streaming + embeddings | Replace raw `openai` SDK calls in `server/index.ts` once we touch them. |
| **Neon / Vercel Postgres** in prod | Same. |
| `docker-compose` for local Postgres + pgvector | Copy verbatim. |

Things we **deliberately do not copy**:

- The chat-only UI (we have a graph editor; that’s the point).
- The `/data/notes/` ingest script (we want UI upload from day one — scripts are deferred).
- The Next.js shell (re-evaluated explicitly at Stage C; see “Stack reassessment”).

---

## Stage A — Stop being a 64 KB toy (still single user, no DB)

> Outcome at end of stage: the Retrieve node *behaves* like a real retriever. No backend changes beyond what we already have. Lands without any DB, auth, or new deployable.

| Step | Task | Effort | Files |
|---|---|---|---|
| **A1** | **Citations in answer.** LLM system prompt requires `[1]`-style citations and an explicit “I don’t know” path. Numbered passages from Retrieve carry `[doc title (¶N)]` source labels. | 30–45 min | `data/ragDemoGraph.ts` (system prompt + Join template), `executors.ts` (Retrieve serializer) |
| **A2** | **Embedding cache (client).** SHA-256 of `chunk.text + model` keys an IndexedDB store; only re-embed misses. Cosine becomes free on stable corpora. | ½ day | New `lib/embedCache.ts`, used inside `engine/retrieve/rankRetrieve.ts` |
| **A3** | **Structured chunking.** Paragraph + heading aware, never split mid-paragraph unless a paragraph itself is > `chunkSize`. Each chunk carries `{ docId, title, paragraphIndex }` so citations are exact. | ½ day | Replace `engine/retrieve/chunk.ts`, expand its tests |
| **A4** | **Persistent named corpora (IndexedDB).** New `corpusStore` zustand slice + IndexedDB persist. The Retrieve node’s widget becomes a **dropdown of corpora** + an **“Edit corpus”** dialog. Migration: read legacy `widgetValues[1]` once and seed a `corpus-default` entry. | 1 evening | New `store/corpusStore.ts`, modified `NodeComponent` / `NodeInspector`, migration in `main.tsx` |
| **A5** | **Drag-drop ingest (text only).** `.md`, `.txt`, `.json`. Each file becomes a `Document` with `{ id, title, body, addedAt, sha256 }` (in code); the saved corpus is `# title` sections joined by `---` (see `lib/corpusFileIngest.ts`). Skip PDFs in v1. | 2–3 h | `lib/corpusFileIngest.ts`, `components/CorpusEditDialog.tsx` (drop + browse) |

**A1 done:** Retrieve output starts with citation + “I don’t know” instructions; each hit is `Passage [n] — [doc title (¶k)] (score …)`; `TextChunk` carries `docTitle` / `partIndex`; RAG demo (`?demo=rag`) LLM + Join text match that contract.

**A2 done:** `lib/embedCache.ts` — IndexedDB `flow-prompt-embed-v1` (in-memory `Map` when `indexedDB` is missing, e.g. tests). Cache key = SHA-256 of `model\0text` with `getDefaultEmbedModel()` from `VITE_OPENAI_EMBED_MODEL` (default `text-embedding-3-small`, must match server `OPENAI_EMBED_MODEL`). `rankChunksForQuery` cosine path uses `getEmbeddingsCached` for the query and each chunk batch so repeat runs skip `/api/embed` for known text.

**A3 done:** `engine/retrieve/chunk.ts` — **paragraph-first** chunking: documents split on `---`, then on blank lines into paragraphs; greedy packing merges whole paragraphs up to `chunkSize`; a paragraph longer than `chunkSize` is the only case split by **characters** (with the same `overlap` step as before). `TextChunk` adds **`docId`**, **`firstParagraphIndex`**, **`lastParagraphIndex`**. Consecutive windows overlap in characters with **snap to paragraph start** (see `nextStartParagraph1Based`). IndexedDB entry counts may **drop** for the same default corpus vs sliding-window-on-raw-text.

**A4 done:** `store/corpusStore.ts` + `corpusDb.ts` — corpora live in IndexedDB `flow-prompt-corpora-v1` (memory map in tests). **`corpus-default`** is created on init with `defaultRetrieveCorpus.ts` body. **`widgetValues[1]`** on `AppRetrieve` is a **corpus id** only; `RetrieveCorpusControls` + **`CorpusEditDialog`** replace the inline textarea. **`nodeContentStamp`** for `AppRetrieve` includes `getStampPart(id)` so editing corpus text invalidates partial-run cache. **`main.tsx`** `await init()` then loads the graph then **`migrateAppRetrieveNodes()`** (inline pasted text → `corpus-legacy-<nodeId>`; missing id → `corpus-default`).

**A5 done:** `lib/corpusFileIngest.ts` — allow `.md` / `.txt` / `.json` (case-insensitive); `fileToIngestedDocument` reads text, `sha256` for embed/identity; `appendIngestedToCorpus` appends each file as a `# <filename>` heading plus body, sections separated by blank-line `---`, and a **64 KB** cap. **`CorpusEditDialog`**: **Browse** (multi-file) and **drop zone** around the textarea; drops on the textarea are handled so files land in the same path.

**Stage-A non-goals:** server, auth, DB, sharing, eval. Strictly client-only. Everything still works offline (BM25), with optional cosine via existing `/api/embed`.

**Stage-A demo:** drop `~/notes/*.md` once, ask “What did I write about <X>?”, get a cited answer, go offline, ask again, still works.

---

## Stage B — Persistence layer (single user, DB backed)

> Outcome at end of stage: data lives in Postgres. Graphs and corpora survive across browsers and devices for the **single developer** running the app. Auth is still mocked (`X-User-Id` header during dev) — Clerk lands in Stage C.

### B.1 Schema (Drizzle, mirrors notewise-ai-ts where it makes sense)

```ts
// server/db/schema.ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),                 // clerk id later; 'dev' for now
  createdAt: timestamp('created_at').defaultNow(),
})

export const graphs = pgTable('graphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  data: jsonb('data').$type<SerializedGraph>().notNull(),  // v1 graph JSON
  isPublic: boolean('is_public').default(false),
  slug: text('slug').unique(),                 // for share URLs (Stage C)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const corpora = pgTable('corpora', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  corpusId: uuid('corpus_id').references(() => corpora.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  sha256: text('sha256').notNull(),
  body: text('body').notNull(),                // raw text; small enough for v1
  addedAt: timestamp('added_at').defaultNow(),
})

export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  paragraphIndex: integer('paragraph_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),  // pgvector
}, (t) => ({
  hnsw: index('chunks_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}))

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id).notNull(),
  graphId: uuid('graph_id').references(() => graphs.id, { onDelete: 'cascade' }),
  status: text('status').$type<'ok' | 'error' | 'cancelled'>().notNull(),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  summary: text('summary'),
  error: text('error'),
})
```

### B.2 New routes (Hono, same server)

| Route | Purpose |
|---|---|
| `GET /api/graphs` / `POST /api/graphs` / `GET /api/graphs/:id` / `PATCH /api/graphs/:id` / `DELETE /api/graphs/:id` | CRUD on saved graphs. |
| `GET /api/corpora` / `POST /api/corpora` | List + create named corpora. |
| `POST /api/corpora/:id/documents` | Multipart upload of `.md`/`.txt`. Server chunks with the same Stage-A function. |
| `POST /api/corpora/:id/embed` | Idempotent: embed missing chunks (server-side embedding cache via the `chunks.embedding IS NULL` filter). |
| `POST /api/retrieve` | `(corpusId, query, k, mode)` → top-K chunks. Cosine uses pgvector’s `embedding <=> $1::vector ORDER BY ... LIMIT k`. BM25 stays client-side until Stage D. |
| `POST /api/runs` | Append-only history. |

### B.3 Client → server moves

- Corpus storage: IndexedDB → Postgres. The IndexedDB `corpusStore` becomes a **read-through cache** for offline / latency. Same UI; same shape.
- Embedding cache: client-side cache from A2 still useful for query embeddings; chunk embeddings now live on the server.
- `Retrieve` executor in **cosine** mode posts to `/api/retrieve` instead of `/api/embed` + ranking in the browser. BM25 stays in-browser.

### B.4 Operational

- `docker-compose.yml` ships a Postgres + pgvector for local dev (copy from notewise).
- `npm run db:generate`, `db:migrate`, `db:studio` parallel to notewise.
- `DATABASE_URL` added to `.env.example`.

**Stage-B non-goals:** auth, multi-user, server-side BM25, evals, reranker.

**Stage-B demo:** load on browser A, save graph, open browser B, see your graphs and corpora.

**B done (repo):** `docker-compose.yml` (pgvector, port 5433). `server/db/schema.ts` + `drizzle/0000_init.sql` (`CREATE EXTENSION vector`, seed user `dev`). `GET|POST|PATCH|DELETE /api/graphs*`, `GET|POST|PUT|DELETE /api/corpora*`, `POST /api/corpora/:id/documents` (multipart), `POST /api/corpora/:id/embed`, `POST /api/retrieve` (cosine + pgvector), `POST /api/runs`. Migrations: `npm run db:migrate`. **Client:** `VITE_SYNC_SERVER=1` → corpus pull/push + **Save to server** / **Load from server** on the toolbar; `VITE_SERVER_COSINE_RETRIEVE=1` → **AppRetrieve** cosine path uses `POST /api/retrieve` (requires prior corpus sync + embed). `GET /api/health` reports `{ database: true }` when `DATABASE_URL` works.

---

## Stage C — Multi-tenancy (Clerk)

> Outcome at end of stage: anyone can sign up; their graphs and corpora are theirs. Public sharing via slug. **At this point we honestly reassess the stack** (Hono+Vite vs Next.js).

### C.1 Auth integration (Hono path; see C.5 for migration option)

- Add `@hono/clerk-auth` middleware on `/api/*` (skip `/api/health`).
- Replace `userId: 'dev'` with `req.auth.userId` from Clerk.
- Add `<ClerkProvider>` + `<SignIn />` / `<SignedIn>` / `<SignedOut>` to the SPA shell.

### C.2 Row-level scoping

Every server query joins on `userId`. Add Drizzle helpers `whereUser(userId)` so this can’t be forgotten. Tests: a request with user A’s token cannot read user B’s graph (return `404`, not `403`).

### C.3 Sharing

- `graphs.slug` + `is_public` flag.
- Public URL: `/g/:slug` reads-only. Editor toolbar adds a **“Make public / copy share link”** button.
- A public graph **does not** expose private corpora it references; embedded corpora are inlined into the public graph snapshot at copy-time. This avoids accidental data leakage.

### C.4 Per-user safety rails

- Per-user run rate limit (in-memory token bucket; Redis later if it ever matters).
- Corpus size cap (e.g. 50 MB / 200 documents per user) to keep dev costs bounded.
- LLM cost ceiling per user per day; hard error past it.

### C.5 Stack reassessment (the honest part)

Once Clerk + Drizzle + Postgres are in play, the *original* trade-off in `07-tech-stack-rationale.md` shifts. Two paths:

**Path 1: Stay on Hono + Vite (recommended).** Add `@hono/clerk-auth`, keep the long-lived process, keep the streaming story intact. Slightly more wiring than Next.js + Clerk, but preserves the editor’s differentiating story (and the bundle stays ~150 KB gzipped).

**Path 2: Migrate to Next.js, mirror notewise-ai-ts.** Single deployable, file-based routes, server actions, Clerk middleware out of the box. Faster because you’ve done it before. Costs: streaming SSE on Vercel’s function tier requires care; bundle gets bigger; the M5A pan-perf story is harder to tell because it’s buried in `"use client"` files.

**Decision rule:** if at this point editor work is still growing, take Path 1 (don’t move the foundation under it). If editor work is winding down and the next year is mostly product features (sharing, billing, evals, dashboards), take Path 2.

Either way, document the choice (and why) at the top of the README so a reviewer doesn’t have to guess.

**Stage-C non-goals:** real billing, OAuth providers beyond what Clerk gives free, team workspaces, RBAC.

**Stage-C demo:** sign up on the public URL, paste your notes, get a working private RAG graph, share a read-only link to a friend.

---

## Stage D — Real RAG quality

> Outcome at end of stage: a reviewer with a CS background reads `engine/retrieve/` and recognizes textbook RAG, not “char windows + cosine.”

| Step | Task | Effort |
|---|---|---|
| **D1** | **Hybrid retrieval (RRF).** BM25 ranks (server side via `tsvector`) + cosine ranks (`<=>`); fuse with `score = sum(1 / (60 + rank))`. ~30 LOC plus an integration test. | ½ day |
| **D2** | **Reranker.** New `/api/rerank` route calling a cross-encoder (cohere reranker or `bge-reranker-base` via Together / a managed endpoint). Re-orders top-50 to top-K. | ½ day |
| **D3** | **Query rewriting / HyDE.** New `AppRewrite` node type: takes the user question, asks the LLM to produce a search-friendly query (or HyDE: a fake answer used as the query). Useful for sparse corpora. | ½ day |
| **D4** | **Eval harness.** A `data/evals/` folder with ~20 hand-written `(question, gold_passage_ids)` pairs + a `npm run eval` script that runs the RAG graph against each and reports recall@K and citation overlap. **This is the single thing that separates a serious RAG project from a weekend project.** | 1 day |
| **D5** | **Optional: structured outputs in citations.** When the LLM finishes, parse `[1]`/`[2]` markers and render Output as text with **clickable** footnotes that scroll to the snippet in Retrieve’s top-hits panel. | 2–3 h |

**Stage-D non-goals:** custom-trained embedders, fine-tuned LLMs, reasoning-step graphs, agent tools.

**Stage-D demo:** put any one well-known evaluation set (e.g. a small slice of MIRACL) through the harness, show recall@5 going up as you turn on RRF / reranker / rewrite. *That’s* the slide that gets a reviewer’s attention.

---

## Sequencing summary

```
Stage A  (≈ 3 evenings)   — single user, no DB, ships standalone
Stage B  (≈ 4 evenings)   — Postgres + pgvector + saved graphs / corpora
Stage C  (≈ 3–5 evenings) — Clerk + sharing + stack reassessment
Stage D  (≈ 3 evenings)   — RRF + reranker + eval harness
```

You can stop after any stage and the project still tells a story. **A** alone makes the demo honest. **A+B** makes it a real single-user tool. **A+B+C** makes it a sharable product. **A+B+C+D** makes it the “serious RAG project” version of the project.

Recommended order if you want to maximize signal-per-evening:
1. Stage A in full (highest ROI; all client-side).
2. Just **D4 (eval harness)** out of order, before Stage B. *Yes, with a fake DB.* The eval harness reveals which Stage-D items even matter for your corpus, so you don’t spend a week wiring a reranker that adds nothing.
3. Stage B.
4. Stage C.
5. Whatever Stage D items D4 said were worth doing.

---

## What this is NOT

- A clone of notewise-ai-ts. (We reuse plumbing, not the product.)
- A second chat UI. (The editor is the surface.)
- A vector DB benchmark. (pgvector is fine; no point switching to Qdrant for a portfolio.)
- A general-purpose agent platform. (No tool-calling / no plan-and-execute; that’s a different project.)
- A real billing / SaaS. (We add cost ceilings and stop.)

---

## Cursor-rule note

`interview-pitch-sync.mdc` already requires `INTERVIEW-technical-challenge-pitch.md` to be updated when code changes. After each stage above lands, the “Editor / product depth” bullet there should grow exactly one line — no more. Bullets that grow into paragraphs are how interview docs go stale.

---

## After this doc

This roadmap covers the **RAG product** dimension. The orthogonal question — *“RAG is one shape of LLM use; what about agents?”* — is answered in [`09-agents-strategy.md`](./09-agents-strategy.md), with concrete designs in [`10-agent-node-design.md`](./10-agent-node-design.md) (ship next, after Stage A+B here) and [`11-agents-as-graphs.md`](./11-agents-as-graphs.md) (gated, ambitious). Stage A+B of *this* doc is **Gate G1** for that work — i.e. don’t start the agent node until RAG is honestly usable.

---

## When this doc is wrong

If at any point the editor stops being the differentiator (e.g. you find yourself spending 80% of evenings on chat UX, not graph affordances), pause and reconsider whether the right next step is **a separate app** that uses Flow Prompt Studio as a library, rather than letting Flow Prompt Studio drift toward being a chat product. The graph editor is the moat; defend it.
