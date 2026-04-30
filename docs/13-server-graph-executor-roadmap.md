# 13 — Server-side graph executor (re-architecture roadmap)

> **Status (2026-04).** `runSavedGraph` and spam Stage B integration are **implemented** (see `server/engine/runSavedGraph.ts`, `runSpamStageB`). Supported server node types are a **subset** of the studio; cosine retrieval for Stage B is still composed in `runSpamStageB` and appended in the `AppLlm` executor when `stageBLlmAugment` is set — full “retrieval as graph nodes only” remains future work.

> **Goal.** Make the visual editor the literal execution definition for server pipelines, not just a parallel mock-up. This doc describes layering and extension boundaries beyond the first milestone.

---

## 1. Problem statement

**Today**

- **Browser:** `runGraph.ts` topologically executes nodes via `getExecutor()` in `src/engine/executors.ts`. Outputs flow edge-by-edge; partial runs reuse cached upstream outputs.
- **Server:** `runSpamStageB` calls **`runSavedGraph`** on the stored **`spam-default`** JSON: topo order, `AppSpamItemSource` / `AppTee` / `AppSpamRules` / `AppJoin` / `AppLlm` (`server/engine/serverExecutors.ts`). Cosine retrieval for examples + policy is still applied **outside** the graph and passed as **`stageBLlmAugment`** on the LLM step so cited-snippet semantics stay stable.
- **Gap:** Other studio node types (`AppRetrieve`, `AppAgent`, …) are not server-routed yet; retrieval is not exclusively graph-driven.

**Target**

- **`runSavedGraph(db, userId, graphId, seeds)`** — load `graphs.data`, topological sort, execute each node with a **server executor registry**, return terminal outputs (or a designated sink).
- **Spam Stage B** becomes: `runSavedGraph(..., 'spam-default', { itemId })` plus a thin **application layer** (write `runs`, `spam_decisions`, update `spam_items`). Combine logic can stay in code initially or move to a `SpamCombine` executor later.

---

## 2. Layering

```
┌─────────────────────────────────────────┐
│  Application: spam (and future verticals) │
│  runSpamStageB → runSavedGraph + DB writes │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│  server/engine/runSavedGraph.ts           │
│  (topo sort, input wiring, abort, limits) │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│  server/engine/serverExecutors.ts       │
│  AppLlm → OpenAI direct                 │
│  AppSpamRules → evaluate + DB rules     │
│  AppJoin / AppTee / … → pure TS         │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│  Shared packages (optional)              │
│  topologicalSort, GraphNode types,      │
│  zod shapes for SerializedGraph         │
└─────────────────────────────────────────┘
```

**Browser** keeps `src/engine/runGraph.ts` + `executors.ts` where LLM calls `fetch('/api/complete')`. **Server** gets parallel executors that call OpenAI/embeddings in-process (no self-HTTP loop).

---

## 3. Executor parity matrix

| Node type | Browser | Server (v1) |
| --- | --- | --- |
| `AppInput` | widget text | **yes** |
| `AppOutput` | passthrough | **yes** |
| `AppLlm` | `POST /api/complete` | **yes** (`openai.chat.completions.create`) |
| `AppJoin`, `AppTee`, `AppPick` | pure | `AppJoin` / `AppTee` **yes**; `AppPick` not yet |
| `AppRetrieve` | IndexedDB + optional `/api/retrieve` | `/api/retrieve` or direct pool + embed |
| `AppSpamRules` | `POST /api/spam/evaluate` | **yes** — `evaluateSpamRules` in-process |
| `AppSpamItemSource` | `GET /api/spam/items/:id` | **yes** — Drizzle read |
| `AppAgent` | tools + complete | defer or subset |

Nodes that **cannot** run on server without new deps should **fail fast** with a clear error if present in a server-routed graph.

---

## 4. Extension boundaries (narrative)

- **Core:** graph JSON schema, topo engine, server runner, generic persistence (`graphs`, `runs`).
- **Extension “spam”:** `spam_*` tables, `/api/spam/*`, spam executors, `/spam` UI. Registers node types; core does not import spam-specific types in the long term.

This matches the portfolio story: *at work, a dedicated spam pipeline editor; personally, a reusable engine where spam is one plugin.*

---

## 5. Migration strategy

1. **Extract** `topologicalSort` (and any pure helpers) to `src/engine/graph/topologicalSort.ts` re-exported from current paths — **no behavior change**.
2. **Add** `server/engine/runSavedGraph.ts` that only implements nodes already needed for parity with `runSpamStageB`: no need to support full `AppAgent` v1.
3. **Implement** server executors for `AppLlm`, `AppJoin`, `AppTee`, `AppSpamRules`, `AppSpamItemSource` (and optionally stub unsupported nodes).
4. **Replace** the body of `runSpamStageB`’s LLM path with `runSavedGraph` output parsing — keep `combineSpamStageB`, `finishSpamStageB`, retrieval **or** express retrieval as graph nodes (bigger change).
5. **Tests:** golden test: same item + same graph JSON → same structured judge output (within LLM variance; mock OpenAI in test).

---

## 6. Non-goals (v1 of executor)

- **Feature parity** with every studio node on day one.
- **Streaming tokens** through the server runner for production batch jobs (batch can use non-streaming `json_object`).
- **Dynamic graph selection per ingest source** — still one `spam-default` name until routing config exists.

---

## 7. Related code (today)

| Location | Role |
| --- | --- |
| `server/spam/spamStageB.ts` | Stage B: retrieval + **`runSavedGraph`** + `combineSpamStageB` + `finishSpamStageB` |
| `server/spam/spamApi.ts` | `GET/PATCH /api/spam/pipeline`, ingest, decisions, demo seed |
| `src/engine/runGraph.ts` | Client topo runner |
| `src/engine/executors.ts` | Client executor registry |
| `server/engine/runSavedGraph.ts` | Server topo runner |
| `server/engine/serverExecutors.ts` | Server executor registry |

When `runSavedGraph` lands, update ARCHITECTURE.md §4 to say Stage B **executes** the stored graph rather than **mirrors** it.

**Done:** §4 and §12 in `ARCHITECTURE.md` describe Stage B as executing the stored graph via `runSavedGraph`; this bullet kept for doc history.
