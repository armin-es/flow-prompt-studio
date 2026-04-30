# 09 — Agents strategy

> **TL;DR.** Flow Prompt Studio is a **DAG executor**: topological order, each node fires once. RAG fits that shape; **agents do not**. This doc names the three honest paths forward, sequences them, and — most importantly — defines explicit **go/no-go gates** between them so the project isn't passively dragged into a months-long rewrite.

Read after `05-real-node-design.md` (RAG node design) and `08-from-demo-to-product.md` (RAG product roadmap). The concrete design docs are `10-agent-node-design.md` (Path 2) and `11-agents-as-graphs.md` (Path 3).

---

## Why RAG and agents are not the same problem

| | **RAG / pipeline** | **Agent** |
|---|---|---|
| Shape | Data flow | Control flow |
| Execution | Topological, each node fires once | Loop until stop; LLM picks next step |
| Edges carry | Data (TEXT / vector / etc.) | Data **and** control |
| Cycles? | No | **Yes** |
| Conditional edges? | No | **Yes** |
| Cache validity (what we’ve built) | `nodeContentStamp` + `partialRunValidation` | Both break under cycles; needs step-indexed provenance |

This is not a *node-type* difference — it’s a *runtime* difference. Adding tools to the LLM node alone is not enough; the moment a graph has a loop, our partial-run / cache story (one of the more interesting things in the project for an interview) collapses unless we replace it.

---

## What `agent` actually adds over RAG

So we can defend the choice in writing without hand-waving:

| Capability | Achievable with current DAG? | Needs real agent? |
|---|---|---|
| **Tool diversity** (search, code-exec, HTTP, calendar, file I/O) | No — the DAG is one fixed pipeline | **Yes — this is the only thing agents fundamentally add** |
| **Iterative refinement** (“did I answer? if not, retry”) | Faked with a manual re-run | Native |
| **Branching plans** (“if comparison ⇒ A, else B”) | Faked with always-on parallel branches | Native |

The first row is the only honest reason to call something an *agent platform*. Everything else is rhetoric.

---

## The three paths

### Path 1 — Stay a prompt-pipeline editor (positioning, not work)

Commit explicitly that Flow Prompt Studio is a **visual editor for prompt pipelines**. Pipelines (RAG, chains, fan-out/fan-in, fixed-route routers) are DAGs and the editor handles them well. Agents are control flow; control flow as a graph is a different project (LangGraph already does it).

This is *not* a build phase. It is a **positioning statement** that lives in the README and lets you defend the scope in interviews:

> *“The editor’s value is making prompt pipelines visible and editable. Agent control flow is a different abstraction; for that I’d reach for LangGraph.”*

**Concretely, Path 1 = finishing `08-from-demo-to-product.md`.** When Stages A and B of that doc are done, Path 1 is done. No new code is needed for Path 1 *as a path* — the work has already been planned in 08.

### Path 2 — One `AppAgent` node that runs the loop internally

**Status (2026-04): shipped.** `AppAgent`, companion `AppTool` leaves, **`AppToolsJoin`** for merging **`TOOLS`** payloads, and **`POST /api/complete/tools`** — see `10-agent-node-design.md` and the README.

Add a single new node type. Inputs: prompt + tool list. Internally: an OpenAI tool-calling loop with a step budget. Outputs: final answer + trace (so the editor can show *something* about what the agent did).

Engine stays a DAG. **No architectural changes** to the topological runner itself.

> Interview line earned: *“Yes, agents are supported — `AppAgent` is a tool-calling loop in one node. The graph stays a DAG; agents live inside a node, not the whole architecture.”*

Concrete design: **`10-agent-node-design.md`**.

### Path 3 — Make the engine support agent-shaped graphs

Add three new primitives, all of which require runtime changes:

1. **`If` / conditional edges** — an edge fires only if its predicate (TEXT comparison or LLM-judged boolean) holds.
2. **`Loop` / `Until`** — cycles with a termination condition + step budget.
3. **`Tool` node** as a first-class type — the LLM node grows a `tools` port; LLM `tool_calls` become fan-out at runtime.

The runtime stops being a DAG executor. The current `nodeContentStamp` cache assumes each node has *one* content state per run; under cycles, every fire is a separate step and we need execution-step provenance instead.

> Interview line earned: *“The editor is the place where you see and edit the agent’s control flow, instead of it being buried in `.py` files. That’s a real thesis. It’s LangGraph’s pitch — I’m the visual one.”*

Concrete design: **`11-agents-as-graphs.md`**.

---

## Sequencing (with gates)

Each path runs **only** when its preceding gate is met. The gates exist so the project ships value at each step instead of getting stuck mid-rewrite.

```
[ Path 1: finish RAG product (doc 08) ]
            │
            │  Gate G1: doc-08 Stages A and B are merged
            │  RAG is honestly usable on real notes, single-user, persistent
            ▼
[ Path 2: ship AppAgent node (doc 10) ]
            │
            │  Gate G2 (the one to defend explicitly):
            │    - AppAgent has been used in at least one demo / interview
            │    - You can articulate why "agent-as-a-node" is NOT enough for what you want next
            │    - You have ≥ 4 free evenings ahead, undisturbed
            ▼
[ Path 3: agents-as-graphs runtime (doc 11) ]
```

### Gate G1 — RAG is usable

- `08`-A done: citations, structured chunking, persistent named corpora (IndexedDB), drag-drop ingest.
- `08`-B done: Drizzle + Postgres + pgvector; corpora and graphs survive across browsers.
- Single-user is fine. Auth (08-C) is **not** required to clear G1.

If G1 isn’t met, **don’t start Path 2**. The “yes, agents too” line means nothing if the RAG demo is still a 64 KB toy.

### Gate G2 — Path 3 has a real reason

This is the gate to defend in writing **before** writing any Path-3 code:

1. Path 2 has been used (demo / interview / personal use) for at least a couple of weeks.
2. There is a concrete graph you tried to build that **needed** cycles or conditional edges and `AppAgent` could not express. Write it down. If you can’t produce one, Path 3 is hype, not need.
3. You have ≥ 4 uninterrupted evenings ahead. Path 3 is not “ship a sub-feature in an evening” work; partial implementations are worse than no implementation.

If any of these is false, **don’t start Path 3**. Going straight from Path 2 to Path 3 is the most likely failure mode for this project.

---

## What is intentionally out of scope, by stage

### Path 1 (now → Stage B of doc 08)
- No tools, no agent loop.
- The LLM node stays single-shot.
- No `If`, no `Loop`.

### Path 2 (`AppAgent`)
- No agent visibility *in the graph* — the trace is a panel inside the node, not new edges.
- No new edge types.
- No engine changes.
- No multi-agent / agent-of-agents (one `AppAgent` is enough; collaboration is a Path 3 question).
- No long-running / async / human-in-the-loop pauses.

### Path 3 (agents-as-graphs)
- No multi-agent collaboration topology in the first cut.
- No memory store beyond what fits in a `Loop` node’s state.
- No retraining / no fine-tuning hooks.
- No DSL for tools other than typed functions (Zod → JSON Schema).
- **Existing DAG graphs must continue to work unmodified.** This is a hard requirement.

---

## Failure modes to watch

These are the failure modes that turn this from a portfolio asset into a stuck project:

1. **Skipping G1.** Shipping `AppAgent` while RAG is still demo-grade. The agent has nothing useful to retrieve over.
2. **Skipping G2.** Starting cycle / conditional-edge work without a concrete graph that demanded it. The result is half-finished `If` and `Loop` nodes that break the existing partial-run story without earning new capability.
3. **Path 3 with weekly time budgets.** A runtime rewrite needs a contiguous block. Don’t start it on a “maybe an hour tonight” schedule.
4. **Letting agents become the project.** If at any point the editor work has stopped and only agent work remains, you have started building a different project that happens to live in the same repo. Reconsider whether it should be in the same repo at all.

---

## Where this leaves the README pitch

After **Path 1 (= doc 08 Stages A+B)** alone, the pitch is honest as: *“visual editor for prompt pipelines; ships with a real RAG node and persistent corpora.”*

After **Path 2**, it becomes: *“…and a tool-calling agent node that fits next to retrieve in the same graph.”*

After **Path 3**, it becomes: *“…and the runtime supports agent-shaped graphs (cycles, conditional edges, first-class tools) — the editor is where you see the agent’s control flow.”*

Each line is earned by code, not by intention.

---

## When this doc is wrong

If at G2 you find that you don’t actually want Path 3 — e.g. `AppAgent` is enough for everything you want, or you’d rather spend evenings on the editor itself — **stop here and update this doc**. *Choosing not to do Path 3* is a perfectly defensible end state for the project, and that ending should be written down so it doesn’t feel like an abandoned TODO.
