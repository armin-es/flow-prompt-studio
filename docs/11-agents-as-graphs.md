# 11 — Agents as graphs (Path 3 design)

> **Status:** Design only. **Blocked by Gate G2** in `09-agents-strategy.md`. Do not start implementation until that gate is met. This document exists so that *if* G2 is met, the work has a coherent plan instead of being made up week by week.
>
> **Effort estimate.** ~4–8 evenings *if* it is the only thing in flight. Likely more in practice. This is the largest item ever proposed for the project.
>
> **Thesis.** The editor’s graphical nature pays off more for **control flow** than for **data flow**. Pipelines are easy to read in code; agent control flow is not. If the graph can express cycles + conditional edges + first-class tools, the editor becomes the place where you *see and edit the agent*, instead of agent code being buried in `.py` files. That is exactly LangGraph’s pitch — Flow Prompt Studio’s differentiator is being the **visual** version.

Read after `09-agents-strategy.md` and `10-agent-node-design.md`.

---

## What in the current runtime breaks

The DAG-only assumption isn’t a vibe — it is hard-coded in three concrete places:

| Code | Assumption |
|---|---|
| `engine/topoSort.ts` (and any caller) | Edges form a DAG. A cycle would cause sort to throw or produce a wrong order. |
| `engine/downstreamFrom.ts` → `nodesDownstreamFrom` | Walks edges forward; with cycles this either revisits forever (without a `visited` set) or returns the strongly-connected component (with one). Neither matches what *“downstream”* should mean for partial runs in a cyclic graph. |
| `lib/partialRunValidation.ts` → `nodeContentStamp` | Assumes each node has **one output state per run**. Under loops, the *same node* fires multiple times with different inputs each iteration, so a single stamp is meaningless. |

There are also softer assumptions in the UI:

- `executionStore` keys results by `nodeId`. Loops need keys by `(nodeId, step)`.
- `runOutputCacheStore` caches one value per `(nodeId, portIndex)`. Same problem.
- `Toolbar` enables / disables “Run from here” based on a single notion of *downstream*.

None of this is impossible to fix; all of it is real work.

---

## New runtime model

Move from a single-fire DAG executor to a **step-indexed execution model**. The conceptual shift is small, but it touches state stores.

### Concepts

- **Run.** One press of ▶ Run. Has a `runId`.
- **Step.** A single **node fire** within a run. Has `(runId, stepIndex, nodeId)`. The same `nodeId` can appear in many steps if it’s inside a loop.
- **Token.** Carries data along an edge; produced by a step’s output port, consumed by a step’s input port. Each token is tagged with the step that produced it.

This is *exactly* the trace model agent frameworks already use (LangSmith / Langfuse / OpenAI’s `responses.runs`); we are not inventing terminology.

### Topological-with-cycles execution

The runtime becomes a **scheduler** rather than a single-pass topological sort:

```
queue ← entry nodes (no inputs, or marked entry)
while queue not empty and budgets not exceeded:
    step ← dequeue
    if step.signal.aborted: bail
    inputs ← collect tokens from upstream steps for this node-fire
    outputs ← executor(step.nodeId, inputs, ctx)
    for each outgoing edge:
        if edge.predicate(outputs): emit token to next node’s queue
    if any cycle node would re-fire: enqueue with stepIndex+1
```

Three things matter:

1. **Edges have predicates** (default: always true). This is how `If` works.
2. **Cycles fire by re-enqueuing** the next step. This is how `Loop` / `Until` works.
3. **Budgets are global per run**: `maxSteps` (default 64), `maxWallMs` (default 30s). Hard ceilings; exceeding them is an error, not a warning.

### Caching under cycles

The current `nodeContentStamp` story degrades gracefully:

- Pure DAGs (no cycles, no `If`, no `AppAgent`) keep working **identically** — the partial-run cache is unchanged. This is the “DAG fast path.”
- Once a graph contains any cyclic / agent-shaped node, the entire run is marked `non-cacheable`; “Run from here” is disabled with a clear tooltip (*“cycle in graph; partial runs not supported”*). No silent wrong answers.

A future enhancement (not v1 of Path 3) is **per-step caching** keyed by `(nodeContentStamp, fingerprint(inputs))`. Out of scope here.

---

## Three new primitives

Each primitive is its own milestone. They land in this order: **P3a → P3b → P3c**, with a go/no-go gate between each.

### P3a — `Tool` as a first-class node + LLM `tools` port

This is the smallest of the three and the most useful on its own.

- New node type `AppTool` (already designed in doc 10 for Path 2; **same node**, reused).
- `AppLlm` grows a new input port `tools : TOOLS`.
- The runtime: when the LLM returns `tool_calls`, the LLM node’s execution **fans out** as additional steps — one per call — whose results feed back into a *next* LLM step.

The user *sees* the agent loop in the graph because each tool call is its own step, but the **graph topology is still DAG**. We unroll the loop in *time*, not in *structure*. This is enough to express tool-using agents without true cycles.

> **Where this lives architecturally.** P3a is mostly an executor change for `AppLlm` and a new edge type for `tool_call → tool_result` carrying. No `If`. No `Loop`. The DAG-fast-path is preserved as long as the loop fits within a `maxSteps` budget.

**P3a Done = Gate G3a:**
- An agent that calls `retrieve` and `http_get` runs end-to-end with the trace visible step-by-step in the editor.
- The DAG-only fast path is unaffected for graphs that don’t use `AppTool` / `tools` port.
- Go / no-go: was P3a useful enough that you actually need P3b? If `AppAgent` covered the case before and unrolling the loop in the canvas didn’t add reviewer signal, **stop here**. P3a alone is a defensible end state.

### P3b — `If` node and conditional edges

- New node type `AppIf`. Inputs: a value + a predicate. Outputs: two ports, `then` and `else`. Whichever fires gets the value; the other is silent.
- Predicates in v1 are tiny:
  1. Literal string contains / equals / matches regex.
  2. LLM-judged boolean: a small system prompt asks the model to answer `yes` / `no`. Hardened parser rejects anything else.
- Edges are still single-output → single-input; we just have **two outgoing ports** instead of one. No “a single edge fires only conditionally” — that complicates the wire UI for no benefit.

> **Why not arbitrary JS predicates.** Same reason `AppTool.impl` is a dropdown in v1: a code box opens a security and review-time question that the project has no business solving in this milestone.

**P3b Done = Gate G3b:**
- A graph can branch: e.g. *“if user asked for comparison, take A; else take B”*.
- The editor renders the inactive branch dimmed at run time so you can see the path that fired.
- Go / no-go: do you actually want loops, or was branching enough? If branching alone covers your use cases, **stop here**.

### P3c — `Loop` / `Until`

The hardest one. Two node types:

- **`AppLoop`** — fires its body repeatedly until the body emits a `done : TEXT` token. The body is *a subgraph attached to the loop* (not an inline cycle), much like a `for` block.
- **`AppUntil`** — same, but the termination predicate is on the loop value (regex / LLM-judge), not a `done` signal.

Termination guarantees:

1. **Hard step ceiling per loop** (`maxIters`, default 8, max 32). Exceeding it throws.
2. **Global wall-clock ceiling** (already part of the run budget). Exceeding it cancels the run.
3. **Structural cycle detection at *edit* time.** The editor refuses to save edges that would create cycles outside an `AppLoop` body. Cycles only legal *inside* a loop subgraph.

> **Why subgraph rather than free-form cycles.** Free-form cycles in the canvas (any edge can point backward) make termination analysis intractable and the cache story unrecoverable. A subgraph-bounded cycle keeps termination local and keeps the rest of the graph cacheable.

**P3c Done = Gate G3c:**
- A graph can express *“try answer; if not good enough, refine; loop up to N times.”*
- Step / wall budget is enforced.
- Caching outside the loop body is unaffected.

---

## What stays the same

This is critical for not breaking existing value:

| Existing feature | Path 3 effect |
|---|---|
| Pan/zoom, port/edge layout, marquee, undo/redo, copy/paste, keyboard | Untouched. |
| `viewportMath` | Untouched. |
| `topoSort` for pure-DAG graphs | Still used; the scheduler defers to it on the fast path. |
| `nodeContentStamp` / `partialRunValidation` for pure-DAG graphs | Unchanged. |
| Existing demos (`?demo=joinllm`, `?demo=rag`, etc.) | Must still pass without changes. |
| `AppAgent` (Path 2) | Continues to work. P3a deprecates *the need* for it but doesn’t remove the node — graphs that already use it stay valid. |

> **Migration rule.** No saved graph (in `localStorage` or JSON export) ever loses meaning. If a user opens a 6-month-old graph, it runs identically. New features are opt-in via new node types.

---

## State / store changes

Concrete file impact, ordered by surface area:

| File | Change |
|---|---|
| `engine/runGraph.ts` | Replace single-pass executor with the scheduler model. The DAG fast path is a special case that calls the existing topological executor. |
| `engine/topoSort.ts` | Unchanged for DAG; new helper `partitionCyclicSubgraphs` for cyclic graphs. |
| `store/executionStore.ts` | Outputs keyed by `(nodeId, stepIndex)`. UI reads the *last* step for live display. |
| `store/runOutputCacheStore.ts` | New flag `runWasCyclic: boolean`. If set, partial-run cache is invalidated and ▶ From here is disabled. |
| `engine/downstreamFrom.ts` | New variant `cyclicSafeDownstream` for the editor’s “run from here” disabled-with-reason logic. |
| `lib/partialRunValidation.ts` | Add early return: if any node in a graph is cyclic-capable (`AppLoop`, `AppUntil`, `AppLlm` with `tools` connected), return *“partial runs disabled (cyclic graph)”*. |
| `components/EdgeLayer.tsx` | Render two outgoing edges for `AppIf`’s `then` / `else` distinctly. Dim the unfired branch after a run. |
| `components/NodeComponent.tsx` | New widget renderers for `AppIf`, `AppLoop`, `AppUntil`. |
| `components/Toolbar.tsx` | Disable “▶ From here” when `runWasCyclic`. |

---

## Risks (ranked)

These are the risks that turn Path 3 into a stuck rewrite. Acknowledge them before starting.

1. **Termination bugs.** Wrong loop semantics + a budget bug ⇒ infinite loops in the user’s browser. Mitigation: write the budget enforcement and the test for it **before** any executor logic.
2. **Cache regression on the fast path.** If P3a/b/c accidentally invalidate the DAG-fast-path cache, the project loses its best interview talking point (`nodeContentStamp` partial runs). Mitigation: pure-DAG graphs go through the existing code path unchanged; one regression test per existing demo.
3. **UI confusion.** A node firing multiple times in one run is novel; users will think it’s a bug. Mitigation: subtle step counter on each node header during a run (*“×3”* badge), plus a one-line legend in the run summary.
4. **Scope drift.** Each primitive (`If`, `Loop`, `Tool`) is small in isolation but wants four cousins (`Switch`, `While`, `Try`, etc.). Mitigation: this doc names the v1 primitives. Anything else is a separate, later doc.
5. **Time sink.** Path 3 has the most “interesting work per evening” of any path; that’s why it can swallow months. Mitigation: G3a/G3b/G3c gates exist so you can stop after each milestone with a working app.

---

## Phasing summary

```
Path 3 — agents-as-graphs

  ┌──────────────────────────────────────────────┐
  │ P3a  Tool node + LLM tools port              │  ~3 evenings
  │      (loop unrolled in time, not topology)   │
  ├──────────────────────────────────────────────┤
  │ Gate G3a: was this enough? If so, stop.      │
  ├──────────────────────────────────────────────┤
  │ P3b  AppIf + conditional output ports        │  ~2 evenings
  ├──────────────────────────────────────────────┤
  │ Gate G3b: do you actually want loops?        │
  ├──────────────────────────────────────────────┤
  │ P3c  AppLoop / AppUntil (subgraph bounded)   │  ~3 evenings
  ├──────────────────────────────────────────────┤
  │ Gate G3c: declare Path 3 done.               │
  └──────────────────────────────────────────────┘
```

You can stop after **any** milestone and the project still tells a coherent story. Specifically:

- **After P3a**: *“Tool calls are first-class graph steps; the editor visualizes the agent loop step by step.”* This alone clears the bar for *“yes, agents work”* with engine support, not just `AppAgent` in a box.
- **After P3b**: *“And the graph can branch.”*
- **After P3c**: *“And the graph can loop until done. Editor renders cycles as bounded subgraphs.”*

---

## What this is NOT

- Not multi-agent (no agent-spawning-agent topology). One scheduler, one run.
- Not a long-running async runtime (no human-in-the-loop pauses, no cron, no resume across sessions).
- Not a code-execution sandbox. Tools remain typed functions from a fixed registry.
- Not a replacement for `AppAgent`. P3a coexists with the box-form agent because some users will prefer the box.
- Not a streaming-during-loop redesign. Streaming returns in P3+1, not v1 of Path 3.

---

## Required before starting

Before opening the first PR for P3a, the following must be true:

1. **Gate G2 in `09-agents-strategy.md` is met.** (Path 2 has been live, used, and you can write down a graph it cannot express.)
2. **A regression suite exists for every shipped demo.** `?demo=joinllm`, `?demo=rag`, `?demo=agent` (post-Path 2). Each gets a Vitest run that asserts the final Output node’s text on a deterministic seed (or a structural assertion if the LLM is involved). This is the only safety net during the runtime rewrite.
3. **A 4-evening contiguous block.** Path 3 cannot be picked at week and dropped for two months and resumed. The runtime change has to land coherently or rolled back coherently.

If any of these is missing, *don’t start*.

---

## When this doc is wrong

If after P3a, real use shows that **the box-form `AppAgent` was always enough** — i.e. you never reach for cycles or branching in practice — the right move is to **stop, write that down, and revert P3a if it adds maintenance burden without product value.** The whole point of `09-agents-strategy.md`’s Gate G2 and this doc’s Gate G3a is that *not doing Path 3* is a perfectly valid outcome.

The failure mode this entire doc is designed to prevent is the one where you’re six weeks in, the runtime is half-rewritten, the cache story is broken, and you’re writing TODOs instead of shipping.
