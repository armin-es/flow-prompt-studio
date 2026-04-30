# 13 — Server-side graph executor (re-architecture roadmap)

> **Goal.** Make the visual editor the literal execution definition for server pipelines, not just a parallel mock-up. Today Stage B is implemented as `runSpamStageB` in TypeScript; it **reads** the judge system prompt from the saved `spam-default` graph but does **not** interpret the full graph (topo order, every node). This doc describes the target architecture and layers.

---

## 1. Problem statement

**Today**

- **Browser:** `runGraph.ts` topologically executes nodes via `getExecutor()` in `src/engine/executors.ts`. Outputs flow edge-by-edge; partial runs reuse cached upstream outputs.
- **Server:** `runSpamStageB` duplicates the *idea* of the pipeline (retrieve → LLM → combine) in one function. The saved graph mainly supplies the **LLM system string** (`spam-llm.widgetValues[0]`) and an audit `graph_id`.
- **Gap:** Changing topology (add a join, swap retrieval) still requires a code change on the server. The story “the graph *is* the pipeline” is only partly true.

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
│  server/engine/executors.ts             │
│  AppLlm → OpenAI direct                 │
│  AppSpamRules → DB/rules engine         │
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

| Node type | Browser | Server (target) |
| --- | --- | --- |
| `AppInput` | widget text | same |
| `AppLlm` | `POST /api/complete` | `openai.chat.completions.create` |
| `AppJoin`, `AppTee`, `AppPick` | pure | same code paths (extract to `shared/`) |
| `AppRetrieve` | IndexedDB + optional `/api/retrieve` | `/api/retrieve` or direct pool + embed |
| `AppSpamRules` | `POST /api/spam/evaluate` | import `evaluateSpamRules` + DB rules |
| `AppSpamItemSource` | `GET /api/spam/items/:id` | direct Drizzle read |
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
| `server/spam/spamStageB.ts` | Stage B orchestration, reads judge prompt from graph, retrieval, OpenAI, combine, `finishSpamStageB` |
| `server/spam/spamApi.ts` | `GET/PATCH /api/spam/pipeline`, ingest, decisions, demo seed |
| `src/engine/runGraph.ts` | Client topo runner |
| `src/engine/executors.ts` | Client executor registry |
| `docs/ARCHITECTURE.md` | Current system narrative |

When `runSavedGraph` lands, update ARCHITECTURE.md §4 to say Stage B **executes** the stored graph rather than **mirrors** it.
