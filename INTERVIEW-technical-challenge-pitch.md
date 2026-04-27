# Interview pitch: “Most technically challenging project” — Flow Prompt Studio

Use this to answer **“Tell me about the most technically challenging project you’ve built”** (or the FE variant: **a technically challenging front-end**). The depth you give should match the interviewer (more graph detail for FE, more API/runtime for full-stack if they open that door).

---

## One-sentence logline

**A node-based graph editor in React where users wire Input → LLM → Output, with real server-side completions, pan/zoom, correct edge geometry under zoom, and a run engine that updates per-node state while the graph stays the hard part of the work.**

---

## What was actually hard (your core story)

### 1. **Screen space vs graph space (viewport)**

Pointer events and the DOM are in **screen pixels**. Node positions, edges, and hit-testing live in **graph coordinates** after undoing the same `translate` + `scale` the CSS transform applies. If you mix the two, edges drift, drag feels wrong, and zoom breaks alignment. I centralized the math in a **small, testable module** (`viewportMath`) and use it from the viewport hook so drags, port measurements, and edges stay in sync.

**If they ask “why is that hard?”**  
> “Because it’s the kind of bug that only shows up at certain zoom levels or when you pan — easy to get wrong, annoying to debug without a clear conversion layer.”

### 2. **Edges following nodes**

Edges aren’t a second fake graph: port centers are **measured in the layout**, converted to **graph space**, and cached. The **node layer** stacks **above** the edge SVG in **z-index** so static path hit-tests don’t block **ports**; the **draft** wire is drawn on top for visibility but the stroke must stay **`pointer-events: none`**, or `elementFromPoint` on drop hits the path instead of the input. When a node moves or the viewport changes, the wiring has to recompute. That’s a **data flow and invalidation** problem, not a one-line CSS fix.

### 3. **Run lifecycle and UI state**

A run is a **DAG** executed in **topological order**. Each node has **queued / running / done / error**; the user can **cancel** with **Esc**, which also **aborts** the in-flight LLM `fetch` via `AbortController`. Completions are **streamed** over **SSE** (`/api/complete/stream`); the client coalesces token updates with **`requestAnimationFrame`** so the node tree is not re-rendered on every chunk. The LLM node does a real **server route**; failures surface on that node and in a **“Last run”** summary panel. You can also **re-run from a selected node** after a run: the runner walks only the **downstream** subgraph and **reuses cached upstream port values**. Validity is **per-node** (a **content stamp** from type + `widgetValues`): for each wire that crosses *into* the downstream region from the outside, the **source** node’s stamp must still match the stamp stored when the cache was last written—so you can **edit the selected or downstream** nodes (e.g. **LLM** system) and use **From here** without re-running strict upstream, while edits to an **upstream** feeding that slice require a full **Run** to refresh. Keeping execution state, graph state, and network errors **consistent** without blocking the main thread (async executors) is a non-trivial state design problem in React + Zustand.

### 4. **Global shortcuts vs in-node editing**

You want **F** to fit, **arrows** to nudge selected nodes, **Esc** to stop or clear selection, but not while the user is **typing in a prompt**. I added an explicit check for “focus in a text field” so global handlers don’t fight the editor.

**Optional one-liner:**  
> “It’s a small thing, but it’s the same class of problem as not stealing keyboard shortcuts in a code editor or spreadsheet.”

### 5. **Performance on many nodes (M5A)**

An early version **subscribed every node to `viewport`**, so **pan** caused **O(nodes)** `NodeComponent` re-renders. The fix was to **move port remeasure** off the React render path: **`useGraphStore.subscribe`** on viewport changes, **`rAF`**, and updates to **`portPositionStore`** only, so pan/zoom doesn’t re-render the node tree. I verified the behavior with the **React DevTools Profiler** and a **Stress 200** graph (see the repo README, **Performance (M5A)**).

> **If they ask what you measured:** *“I used the Profiler on a ~200-node stress load and panned: `NodeComponent` no longer re-renders on every frame; the cost is the edge layer and the port store, which is the work you actually need for correct wires.”*

---

## What the “AI” part is (keep accurate)

- The **LLM** is a **server route** (Hono) that validates input and calls the OpenAI API. **No API key in the browser.**
- The **unusual** part is not “I called an API” — it’s the **graph as the control surface**: the run engine walks the graph, and the LLM step is one node in that pipeline, with the rest of the app built around **execution semantics and the canvas**.

If they only care about AI: *“The graph includes an **AppRetrieve** node: **BM25** over **named corpora** (text in **IndexedDB**, not in the graph JSON) by default, optional **cosine** via **`/api/embed`** with an **embed cache** (SHA-256 of model + text) so repeat runs don’t re-hit the API for the same chunk text; the chunker is **paragraph-first**; passages are numbered for **[1]**, **[2]** with `[doc title (¶k)]` labels, and the **RAG** demo uses **I don’t know** when context is insufficient—RAG shape without a vector database.”*

---

## Answer shapes (by length)

### ~60–90 seconds (default)

1. **Context:** I built a **visual node editor** for a small **prompt pipeline** (input text → LLM → output), React + Zustand, **Hono** API for completions.  
2. **Hard part:** The hardest work was the **graph UI**: **pan/zoom**, **ports and edges in graph space** so things stay aligned when you zoom, and **running the graph** in order with per-node status and good error handling from the **LLM** step.  
3. **Proof:** **Vitest** on **viewport math**, **topological sort**, and **partial-run** helpers (downstream set, **per-node** cache validity in `partialRunValidation`); **profiled** panning on a **~200-node stress** graph (see README, **Performance (M5A)**).  
4. **Close:** It’s a portfolio project aimed at **shipping** something deployable, not a tutorial chat UI.

### ~3 minutes (if they want depth)

- Walk through **one bug class**: e.g. “edge endpoint wrong at non-1 scale” → fix was unifying on one transform path.  
- Mention **Zustand** stores: **graph** vs **execution** vs **last run** summary, and **why** you split them.  
- Mention **cancel**: **Escape** sets cancel and **`AbortController` aborts** the in-flight `POST /api/complete` for the LLM node (not only between nodes).  
- If relevant: **undo/history** (snapshots + commit on gestures), **marquee** selection, **drag-to-connect** edges with type check, **localStorage** autosave, **export/import** JSON, **M5A** pan perf (subscribe + rAF to `portPositionStore`, not a viewport hook on every node), **streamed** LLM tokens + **From here** (downstream re-exec, upstream ports from cache when upstream stamps still match), and basic **a11y** (skip link, `aria` on the canvas and fields).  
- **Topology demos (TEXT):** `AppTee` (1→2 fan-out), `AppJoin` (2→1 concat), `AppPrefix`, `AppPick` (2→1 selective)—toolbar **Tee/Join** and **Pick 2→1** need no API; **Join+LLM** is two inputs → **Join** → **AppLlm** → **Output** (merge-then-prompt). **RAG** adds **`AppRetrieve`** (BM25/cosine) with preset **?demo=rag** (tee + retrieve + join + LLM).  
- Offer: **“I can sketch the data flow on a whiteboard.”**

---

## STAR skeleton (if they use strict behavioral)

| | |
|--|--|
| **S**ituation | I wanted one project that shows **serious front-end** (graph/canvas) and **real** LLM usage without only being “a chat with an API key.” |
| **T**ask | Build a **node graph** with **real** server completions, **visible** result on the last node, and a **credible** run experience. |
| **A**ction | Implemented **viewport math**, **port/edge** pipeline, **topological** runner, **Hono** route + env-based model, **tests** for sort + math, **keyboard** rules that don’t break text fields, **abortable** LLM `fetch`, and **editor** affordances (undo, multi-select, wiring, persistence) where they support the story. |
| **R**esult | Shippable app, **documented** tradeoffs, **tests** for critical non-UI logic, a **profiled** perf pass on a large graph (see README M5A), and a clear **story** for interviews (graph first, API second). |

---

## What *not* to overclaim

- Don’t say “I built a LangChain clone” or “a competitor to n8n” — the scope is **intentionally** smaller and clearer.  
- Don’t let **“OpenAI”** be the *only* hard thing; redirect to **graph + state + space**.  
- If you haven’t **deployed** it yet, say: **“I’ve run it end-to-end locally; deployment is the next step”** so you’re precise.

---

## Good follow-up questions to expect

- **Why Zustand?** — “Predictable store updates, minimal boilerplate, and the graph/execution split stayed readable without Redux ceremony.”  
- **Why not all-in-one Next?** — “Vite kept the first iteration fast; the API is a small separate process with a **proxy**; I can consolidate later if the product needs it.”  
- **Biggest bug you hit?** — Have **one** real example (e.g. port/edge at zoom, or execution state after error). If nothing dramatic, be honest: “Most issues were around **coordination and ordering**, not magic.”  
- **What would you do next?** — **Deploy** a public link (if not live yet), **persistent corpus** / vector store for real documents, or further **edge/virtualization** perf if real users need huge graphs — **one** of these, not a laundry list. (M5A pan perf is **done**; RAG **Retrieve** is in; see README.)

---

## Resume line (tune to your target role)

- **FE-heavy:** *“Node-based prompt graph in React/TypeScript (Zustand): pan/zoom canvas, port/edge layout in graph space, topological run with per-node status, **SSE**-streamed LLM step, **re-run from node** (downstream-only + **per-node** cache validity for crossing wires), Vitest; profiled large-graph pan (no O(n) node re-renders on pan).”*  
- **Add Full-stack** if you want: *“Hono + OpenAI API on the server, env-based config, no secrets in the client.”*

---

## What you can credibly say *today* (check `main` before interviews)

**Core (always safe):** viewport math + **Vitest** on math/sort/partial-run validation, DAG run, Hono + no client key, Zustand split stores, `AbortController` on LLM `fetch`, **streamed** completions (SSE) + rAF-batched store updates, **run id** in the result panel, error boundary, keyboard focus guard for shortcuts, **port output cache** + **per-node content stamps** for **From here** (upstream crossing wires must still match; downstream-only edits to the slice are OK), **a11y** (skip link, canvas/field `aria`).

**Editor / product depth (implemented in repo):** **Add** palette on the toolbar to spawn app node types (TEXT pipeline + **LLM** + **Retrieve** / BM25 with optional **cosine** in-browser via `/api/embed` or, with env flags, **pgvector** via **`POST /api/retrieve`**, **client embed cache**, **named corpora** in IndexedDB with edit dialog and **.md / .txt / .json** ingest (drop or browse), optional **Postgres** sync + **Save/Load graph to server** when configured, bracket **citations** and **I don’t know** in the RAG contract) near the view center, connect by **output→input** drag, **Delete** to remove, **Shift+drag** marquee, **group move**, **Meta/Ctrl+click** toggle selection, **Cmd/Ctrl+Z / Shift+Z** undo-redo, **in-app** copy/paste of subgraph, **localStorage** autosave, **export/import** graph JSON, **Node inspector** for app nodes, **Run from here**, **RAG** preset (`?demo=rag`), **Stress 200** for profiling.  

**M5A (done + profiled):** Pan/zoom no longer re-renders every `NodeComponent`; port positions update via **`useGraphStore.subscribe`** on **viewport** + **rAF** into **`portPositionStore`** (no render-path `viewport` selector in each node). Confirmed in **React DevTools Profiler** with **Stress 200** (see [README / Performance (M5A)](./README.md#performance-m5a)). You can add a screenshot to the repo for interviews, but it’s not required.

**M5B / M5D (covered in v1 for the pitch):** **re-run from node** (M5D) and basic **a11y** (M5B) are in the app; a **deeper** roving-keyboard / screen-reader pass on every custom control is still an incremental follow-up. E2E tests are **not** required for the story.

**Older milestone labels** (M5A–M6) in [`../graph-editor-detailed-implementation-plan.md`](../graph-editor-detailed-implementation-plan.md) are a **roadmap**; the bullets above are the **live** pitch.

---

*This file is a prep aid for your repo `flow-prompt-studio`. The Cursor rule **interview-pitch-sync** (`.cursor/rules/interview-pitch-sync.mdc`) requires updating this document whenever you change code or product behavior, so the story stays true. Also refresh the “biggest bug” and “next step” lines when you ship deploy or new features.*
