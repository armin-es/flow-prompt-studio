# Flow Prompt Studio — Architecture Reference

> Personal reference for technical conversations: system design sessions, portfolio walkthroughs, or depth-first engineering discussions. Written to be spoken from, not read aloud.

---

## 1. What the system does in one paragraph

Flow Prompt Studio is a **visual LLM workflow editor** with a built-in **spam triage pipeline** as its production use-case. Users construct directed graphs of nodes — inputs, LLM calls, retrievals, joins, agents — and run them against text. The same graph engine that powers the interactive editor is the **policy layer for an async content moderation pipeline**: when a post is ingested, the server reads the saved graph, extracts the judge's system prompt, and runs a RAG + LLM scoring pipeline against the item. Reviewers see the verdict in an inbox, confirm or override, and when the policy is wrong they open the graph in the editor, fix the prompt, and publish — the next ingest picks up the change.

---

## 2. High-level architecture

```
Browser (Vite SPA)                    API Server (Hono / Node)
─────────────────────────────────     ──────────────────────────────────────
 Graph Editor                          /api/spam/*
  ├─ GraphEditor (canvas)               ├─ POST /items           (ingest)
  ├─ NodePalette                        ├─ GET  /items            (triage list)
  ├─ NodeInspector                      ├─ GET  /items/:id        (detail + stage B)
  ├─ Toolbar                            ├─ POST /items/:id/score  (manual re-run)
  │    └─ "Publish spam policy"         ├─ POST /items/:id/decision
  └─ runGraph (client executor)         ├─ GET/PATCH /pipeline   (graph CRUD for policy)
                                        ├─ POST /demo/seed        (fixtures)
 Spam Inbox (/spam)                     └─ GET/POST/PATCH /rules
  ├─ SpamInbox (list + polling)
  ├─ SpamDetail                        /api/graphs/*  (generic graph CRUD)
  │    └─ "Edit pipeline in studio"    /api/corpora/* (corpus CRUD + embed trigger)
  └─ SpamRulesPanel                    /api/complete  (LLM proxy)
                                       /api/embed     (embedding proxy)
 main.tsx
  └─ ?spamPipeline=<uuid>            PostgreSQL + pgvector
      loads graph from server +        ├─ graphs, runs, users
      pre-fills SpamItemSource         ├─ corpora, chunks (vector(1536))
                                       ├─ spam_items, spam_categories
                                       ├─ spam_decisions (append-only)
                                       └─ spam_rules
```

---

## 3. The graph engine

### 3a. Data model

A graph is a **`Map<NodeId, GraphNode>`** and a **`Map<EdgeId, GraphEdge>`** in Zustand. Each `GraphNode` carries:

- `type` — executor key (`AppLlm`, `AppSpamRules`, `AppJoin`, …)
- `widgetValues[]` — serializable config (system prompt, corpus ID, item UUID, …)
- `inputs[]` / `outputs[]` — typed port descriptors

Edges connect `(sourceNodeId, portIndex)` → `(targetNodeId, portIndex)`. The full graph serialises to a `{ version: 1, nodes: [string, node][], edges: [string, edge][] }` JSON blob that is both stored in `localStorage` and persisted to Postgres via `PATCH /api/graphs/:id`.

### 3b. Execution model (client)

`runGraph.ts` runs entirely in the browser:

1. **Topological sort** — Kahn's algorithm on the edge list; detects cycles before execution starts.
2. **Partial run** — if launched from a selected node, `nodesDownstreamFrom` computes the affected subgraph; upstream outputs are read from the run-output cache (`runOutputCacheStore`) instead of re-executing. This makes iterating on a slow LLM node at the end of a long graph fast.
3. **Node loop** — each node is executed in topo order. Inputs are gathered from a `nodeOutputs` map keyed `nodeId:portIndex`. Each executor is async and receives an `AbortSignal` so a user cancel propagates through open-fetch/streaming calls.
4. **Streaming progress** — LLM executors call `onProgress(partialText)` which the coordinator batches through `requestAnimationFrame` to avoid thrashing React renders during a 200-token stream.
5. **Volatile nodes** — `AppSpamRules` and `AppSpamItemSource` are marked volatile; the partial-run cache always re-executes them even when their content stamp hasn't changed, because they depend on external state (DB rows, rule weights).

**Design tension worth discussing:** Running the graph in the browser means the client can see every intermediate output interactively. The cost is that LLM API keys must stay on the server — all LLM and embed calls go through `/api/complete` and `/api/embed` proxies. The server never streams raw keys to the client; the browser only receives tokens.

### 3c. Node executor registry

`executors.ts` exports a `getExecutor(type)` function that returns an async function `(node, inputs, onProgress, ctx) → outputs`. Adding a new node type is three files:

1. The executor function in `executors.ts`
2. A `case` in `createAppNode.ts` (default size/label)
3. A row in `appTextNodes.ts` (palette + inspector)

No framework, no registration macro. The pattern is intentionally boring.

---

## 4. The spam triage pipeline

### 4a. Why it lives inside the graph app

The existing infrastructure provides for free: a graph engine with retries and abort; a corpus system with chunking + pgvector embeddings + cosine retrieval; a `runs` audit table; an OpenAI client; and a UI for editing graphs. A spam pipeline is `Rules → Retrieve → Prompt → Judge → Action`. Re-implementing the primitives in a separate repo would have taken 2–3 weeks of plumbing.

### 4b. Two-stage classification

```
POST /api/spam/items
        │
        ▼  ~5 ms (sync, same HTTP request)
  ┌─────────────────────────────────────┐
  │  Stage A — deterministic rules      │
  │  evaluateSpamRules(body, features,  │
  │    rules[])                         │
  │  → score                            │
  │  score ≤ 2  → status: allowed       │
  │  score ≥ 8  → status: quarantined   │
  │  else       → status: queued        │
  └─────────────────────────────────────┘
        │ queued / quarantined?
        ▼  async (setImmediate, ~300 ms–2 s)
  ┌─────────────────────────────────────┐
  │  Stage B — graph-driven judge       │
  │  1. Load spam-default graph from DB │
  │  2. Extract spam-llm.widgetValues[0]│  ← system prompt lives in the graph
  │     as system prompt                │
  │  3. Cosine retrieve top-4 from      │
  │     spam-examples corpus            │
  │  4. Cosine retrieve top-4 from      │
  │     spam-policy corpus              │
  │  5. POST to OpenAI (gpt-4o-mini,    │
  │     json_object mode)               │
  │  6. Parse & validate with Zod       │
  │  7. combineSpamStageB(ruleScore,    │
  │     judge) → finalAction            │
  │  8. Persist: runs row, spam_decision│
  │     row (reviewerId=null), update   │
  │     spam_items (runId, llmScore,    │
  │     finalAction, status)            │
  └─────────────────────────────────────┘
        │
        ▼  status: queued / quarantined (suggested action stored)
  Reviewer inbox → confirms or overrides → spam_decisions row (reviewerId≠null)
```

### 4c. Why the graph is the source of truth for Stage B's prompt

`runSpamStageB` reads `spam-llm.widgetValues[0]` from the saved `spam-default` graph row. This means:

- The system prompt is **versioned** — it lives in a graph row with `updated_at`, the same as any other graph.
- Prompt changes **deploy without a code push** — edit in the studio, `PATCH /api/spam/pipeline`, done.
- The change is **auditable** — the `runs` table links each item's Stage B result to the `graph_id` that drove it; you can query "which prompt version produced these false positives."

### 4d. The policy edit loop

```
Reviewer sees wrong verdict on item X
    │
    ▼
"Edit pipeline in studio" (SpamDetail)
    │
    ▼  /?spamPipeline=<item-uuid>
    │
main.tsx bootstrap:
    ├─ GET /api/spam/pipeline  → graphId
    ├─ GET /api/graphs/:id     → graph JSON
    └─ pre-fill spam-src.widgetValues[0] = item-uuid
    │
    ▼
Studio loads with item pre-filled in SpamItemSource
    │
    ▼
Engineer edits spam-llm system prompt → clicks Run
    → sees new verdict in AppOutput panel (browser only, no DB write)
    │
    ▼  satisfied?
"Publish spam policy" (Toolbar, visible when AppSpamItemSource is in graph)
    │
    ▼
PATCH /api/spam/pipeline  (sends current canvas JSON)
    → updates spam-default graph in DB
    │
    ▼
Next ingest: runSpamStageB reads new prompt  ✓
```

### 4e. Rules engine (Stage A)

`spamRulesEngine.ts` is pure TypeScript, no DB, no LLM. It evaluates three rule kinds:

- **`regex`** — optional `perMatch` mode adds weight per match (capped), not just on first hit. Useful for "each additional link adds 0.8 to the score."
- **`url-domain`** — extracts hostnames from all URLs in the body, checks against a blocklist.
- **`feature-threshold`** — compares `authorFeatures.account_age_days ≤ 1` etc. Missing numeric features default to 0 (new-account bias is intentional).

Scores accumulate additively. The thresholds (`SPAM_TAU_ALLOW = 2`, `SPAM_TAU_QUARANTINE = 8`) are constants today; they're the natural place to introduce per-category calibration.

The rules are rows in `spam_rules`, CRUD via `/api/spam/rules`, togglable in the reviewer console. Baseline rules are seeded idempotently on first use.

### 4f. Combine logic

`combineSpamStageB` is a small decision tree, not ML. Rules for the current version:

| Rule score | LLM verdict | Confidence | Final action |
|-----------|-------------|------------|-------------|
| ≥ τ_quarantine | ham | ≥ 0.78 | shadow |
| ≥ τ_quarantine | anything else | — | quarantine |
| < τ_quarantine | spam | ≥ 0.88 AND rule ≥ 6 | remove |
| < τ_quarantine | spam | ≥ 0.45 | quarantine |
| < τ_quarantine | ham | ≥ 0.55 AND rule ≤ τ_allow | allow |
| — | — | — | shadow (default) |

This is the natural place to discuss: why not just trust the LLM? Because the LLM is non-deterministic, expensive, and can be prompt-injected. The rule score provides a cheap, auditable lower bound; the LLM provides context the rules can't model (semantics, intent, novelty). The combiner gives you dials for each failure mode.

---

## 5. Data model

### Core tables (pre-spam)

```
users        id (text PK, Clerk sub or 'dev')

graphs       id (uuid), user_id, name, data (jsonb: SerializedGraphJson), is_public, slug

corpora      id (text), user_id, name, body (text), chunk_size, chunk_overlap
chunks       id (uuid), corpus_id, user_id, part_index, text, embedding (vector(1536))
documents    (ingest metadata — title, source, mime)

runs         id (uuid), user_id, graph_id, status, summary (jsonb), finished_at, error
```

### Spam tables

```
spam_categories  id (text 'cat:uid:general'), user_id, name,
                 corpus_id → corpora (few-shot examples),
                 policy_corpus_id → corpora (policy text)

spam_items       id (uuid), user_id, source, external_id, body, author_features (jsonb),
                 status ∈ {new,allowed,queued,quarantined,decided,dropped},
                 rule_score (real), llm_score (real),
                 final_action ∈ {allow,shadow,quarantine,remove},
                 graph_id → graphs,   ← which graph version classified it
                 run_id → runs,        ← audit pointer to the Stage B run
                 created_at, scored_at, decided_at

spam_decisions   id (uuid), item_id → spam_items, reviewer_id → users (null = system),
                 action, rationale, policy_quote, agreed_with_llm (bool),
                 created_at             ← append-only; full history per item

spam_rules       id (uuid), user_id, name, enabled (bool), weight (real),
                 kind ∈ {regex,url-domain,feature-threshold},
                 config (jsonb), version (int)
```

**Design choices worth discussing:**

- `spam_decisions` is **append-only**. You never update a decision; you append a new one. This gives you the full override history and makes disagreement-rate metrics trivial.
- `graph_id` on `spam_items` makes it possible to query "all items classified by prompt version X" — forensic and retraining-readiness in one column.
- `author_features` is `jsonb` with no schema enforcement at the DB layer. The rules engine interprets keys at evaluation time, so you can add signals (follower count, verified status) without a migration.

---

## 6. Retrieval (RAG path)

### Client-side (BM25)

`AppRetrieve` with mode `bm25` runs entirely in the browser using a hand-rolled BM25 implementation against the corpus stored in IndexedDB (`flow-prompt-embed-v1`). No server, no API key.

### Server-side (cosine / pgvector)

`AppRetrieve` with mode `cosine` calls `POST /api/retrieve`:

1. Server receives query text + corpus ID.
2. Calls `openai.embeddings.create` → `vector(1536)`.
3. Issues `ORDER BY embedding <=> $vec LIMIT k` against `chunks` (pgvector HNSW index).
4. Returns ranked snippets.

The HNSW index makes cosine retrieval sub-linear even at millions of chunks.

For **spam Stage B specifically**, `retrieveCosineChunks` bypasses the HTTP layer and calls the DB directly (server-to-server, same process), avoiding a round-trip. The query uses raw SQL via `getPool()` rather than the Drizzle ORM because pgvector's `<=>` operator requires a literal vector string that Drizzle doesn't natively template.

### Embedding pipeline

`embedPendingChunksForCorpus` runs after any corpus write. It batches un-embedded chunks (where `embedding IS NULL`), calls OpenAI in groups of 64, and writes vectors back. The server auto-triggers it after save when `OPENAI_API_KEY` is set; it can also be triggered manually via `POST /api/corpora/:id/embed`.

---

## 7. Auth model

Three modes, selected by environment:

| Mode | Env vars | How it works |
|------|----------|-------------|
| **Dev / local** | (none) | All routes open; `X-User-Id: dev` header sets tenant. |
| **Password / Bearer** | `AUTH_SECRET`, `AUTH_PASSWORD` or `API_AUTH_TOKEN` | Cookie session (HS256 JWT) or static Bearer token. |
| **Clerk** | `CLERK_SECRET_KEY` | `verifyToken` on every `/api/*` request; `sub` becomes `user_id`. |

Spam routes in non-production additionally accept `X-User-Id` without a full session (`SPAM_ALLOW_X_USER_ID=1` in production), enabling a separate internal tooling token pattern.

Multi-tenancy is row-level: every DB row carries `user_id`; every query ANDs `eq(table.userId, uid)`. There is no shared state between users.

---

## 8. Transport + streaming

### SSE streaming (`/api/complete/stream`)

```
Client AbortController
  → fetch with credentials + signal
  → Hono streamSSE
     → openai.chat.completions.create({ stream: true })
        → async for await chunk → stream.writeSSE({ data: token })
  → client EventSource reader → onProgress(partial)
     → requestAnimationFrame batching in runGraph.ts
```

Client disconnect propagates via `c.req.raw.signal` (Hono exposes the underlying `Request`), which aborts the OpenAI stream. Total code: ~4 lines for the abort path.

### Why SSE over WebSockets

SSE is unidirectional (server → client), which is all token streaming needs. It works over HTTP/1.1 with no upgrade handshake, is trivially proxied by Vercel and any CDN, and is natively handled by `EventSource` in the browser. WebSockets would add bidirectional overhead for no benefit.

---

## 9. Performance considerations

### Canvas rendering

The graph canvas uses a custom `rAF` pan/zoom loop that reads the Zustand `viewport` slice without going through React. Node positions are updated via direct DOM `transform` manipulation rather than re-renders. A 200-node graph pans at 60 fps without triggering any React reconciliation.

### Partial runs

The run-output cache stores the last outputs of every node keyed by a content stamp (node config hash + input hashes). A "run from here" executes only the downstream subgraph, re-using all upstream outputs. This is the main productivity feature for prompt iteration: change the judge system prompt → run from the LLM node → see new output in ~300 ms without re-running retrieval.

### Stage B latency

Stage B is deliberately async (`setImmediate`) to keep ingest at < 10 ms. The typical Stage B wall time is 500 ms–2 s (retrieval: ~50 ms, OpenAI: 400–1500 ms). The inbox polls every 2 s while any item has `runId = null`, then stops. No WebSocket, no push — simple polling is sufficient for human-timescale review.

---

## 10. Key design decisions and trade-offs

### Decision 1: Extend vs. fork for spam

**Chose to extend.** The graph engine, corpora, runs audit, and OpenAI client were re-used for free. The risk is coupling: spam schema changes require coordinating with the graph editor. Mitigation: all spam code is namespaced under `server/spam/*`, `src/spam/*`, `spam_*` tables, `/api/spam/*`, `/spam` route. A future fork via `git filter-repo` would be clean.

### Decision 2: Graph-as-policy-artifact

Storing the judge's system prompt inside the graph's LLM node (rather than as a DB column like `spam_categories.judge_prompt`) means:
- The entire pipeline topology — not just the prompt — is versioned and auditable.
- Engineers can change retrieval depth, join structure, or add new nodes without a schema migration.
- The "open in studio, test, publish" loop is possible because the graph is already a first-class editable artifact.
- **Trade-off:** if multiple users share a category, they'd need separate graph copies. Not a problem today with the single-tenant model.

### Decision 3: setImmediate as the queue

Using `setImmediate` for Stage B deferral is a known shortcut. It works for a demo and a single-process server. Production would need a real queue (BullMQ, pg-boss, or even a `LISTEN/NOTIFY` based approach using the existing Postgres connection) because:
- `setImmediate` work is lost on process restart.
- No back-pressure or retry logic.
- No visibility into queue depth.

The code is isolated in `queueSpamStageB` — swapping it for a real queue is a one-function change.

### Decision 4: Deterministic combine, not ML classifier

A learned combiner would be more accurate but requires labelled training data (we have `spam_decisions.agreed_with_llm` for eventually generating that). The deterministic combiner is auditable, explainable to non-engineers, and tunable with threshold changes. It's explicitly wrong in the codebase comments: the right long-term path is to train a small logistic regressor on the growing decisions dataset.

### Decision 5: Append-only decisions

`spam_decisions` is append-only by design. The alternative — updating `spam_items.final_action` in-place — loses the override history. The append-only table makes it trivial to compute: override rate, reviewer agreement with LLM, mean time to decision, and false-positive sampling for precision/recall estimates. These are the metrics a T&S team would actually monitor.

---

## 11. What I would do differently / scale path

| Current | At 100× scale |
|---------|--------------|
| `setImmediate` queue | pg-boss or BullMQ, 1 worker per CPU |
| Single `spam-default` graph per user | Per-source graph selection (DMs vs. comments vs. posts) |
| Polling inbox (2 s interval) | Server-Sent Events push from a `LISTEN/NOTIFY` channel |
| Hardcoded `gpt-4o-mini` | Model router: cheap model first, escalate on low confidence |
| Single rule set | Per-category rules + A/B test two rule sets by ingest source |
| `agreed_with_llm` boolean | Full precision/recall dashboard, auto-retrain pipeline |
| Cosine only for Stage B | Hybrid BM25 + cosine re-rank (already have BM25 client-side) |

---

## 12. Roadmap: generic server-side graph execution

Today, **Stage B** is still a dedicated TypeScript pipeline (`runSpamStageB`) that **reads** the judge system prompt from the saved `spam-default` graph but does **not** walk the graph node-by-node on the server. The **client** graph runner (`runGraph.ts`) is the only place full topo execution happens — interactive testing only; it **does not** persist verdicts to `spam_items`.

**Target:** `runSavedGraph` on the API server shares the same topo + executor pattern as the browser, with server-side implementations for `AppLlm`, `AppSpamRules`, etc. Then any stored graph can drive production ingest without duplicating logic. See **[13-server-graph-executor-roadmap.md](13-server-graph-executor-roadmap.md)** for layering, executor parity, and migration steps.

**Portfolio framing:** A specialized spam pipeline editor at work → a personal project generalizes the **graph engine + persistence** so spam (and other verticals) become **extensions** on a composable LLM editor.

---

## 13. One-paragraph summary for verbal delivery

> "It's a two-part system. The front half is a visual LLM workflow editor — think a lightweight Comfy UI for language models. Graphs of nodes: inputs, retrieval, LLM, join, agent. You build a pipeline visually, run it in the browser, and the LLM calls proxy through a Hono server so the API key never touches the client.
>
> The back half is a content moderation pipeline that uses the same graph as its policy artifact. When a post comes in, Stage A runs deterministic rules in a few milliseconds. If the score is ambiguous, Stage B fires asynchronously: it cosine-retrieves similar confirmed-spam examples and policy clauses from pgvector, then calls an LLM judge with that context. The judge's system prompt comes from the saved graph in Postgres, not from the code. So when a reviewer sees a wrong verdict, they open the item in the graph editor, change the prompt, run it against that exact item to verify, then publish back to the server. The next ingest uses the new prompt. No deployment needed.
>
> The interesting design decisions: using `spam_decisions` as an append-only audit log so you can measure override rate and train a learned combiner later; linking each classified item to the specific graph version that processed it; and the partial-run cache in the editor that lets you run from just the LLM node downward after changing a prompt, skipping the slow retrieval step above it."
