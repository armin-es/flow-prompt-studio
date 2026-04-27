# 10 — `AppAgent` node design (Path 2)

> **Status:** Design only. Not implemented. Read after `09-agents-strategy.md` (which gates this work behind RAG being usable — see Gate G1 there).
>
> **Goal.** Add **one** new node, `AppAgent`, that runs an OpenAI tool-calling loop internally. The graph stays a DAG. No engine changes. Earns the *“yes, agents are supported”* line in the README without committing to Path 3.
>
> **Effort estimate.** ~1.5 evenings. About the same surface area as `AppRetrieve`.

---

## What the user sees

A new node `AppAgent` in the **Add** palette (label: `Agent`).

```
            ┌──────────────────────────┐
 prompt  ─▶ │  Agent                   │ ─── answer ──▶
 tools   ─▶ │  steps:    [6 ▾]         │ ─── trace  ──▶
            │  model:    [gpt-4o-mini ▾]│
            │  system:   [textarea]    │
            │                          │
            │  Last run:               │
            │   1. retrieve(...)       │
            │   2. http_get(...)       │
            │   3. answer              │
            └──────────────────────────┘
```

The agent loop is **inside** the node. The graph editor does not show the agent’s individual tool calls as edges — that’s Path 3’s job. What the editor *does* show, in the node body, is a **collapsed trace** of the most recent run (one line per step). This is enough for a viewer to understand what happened without lying about the graph being agent-shaped.

---

## Port schema

```ts
{
  type: 'AppAgent',
  inputs:  [
    { name: 'prompt', dataType: 'TEXT' },
    { name: 'tools',  dataType: 'TOOLS' },   // new dataType
  ],
  outputs: [
    { name: 'answer', dataType: 'TEXT' },
    { name: 'trace',  dataType: 'TEXT' },    // markdown summary of the run
  ],
  widgetValues: [
    /* 0 */ 6,                               // step budget
    /* 1 */ 'gpt-4o-mini',                   // model
    /* 2 */ 'You are a careful agent...',    // system prompt
  ],
}
```

### Why a new `TOOLS` dataType

We don’t want to overload TEXT. A `TOOLS` value is a structured array of tool definitions. The `tools` port accepts:

- A single `AppTool` node’s output (single tool).
- A `Join` of `TOOLS` ports (multiple tools merged).

The `Join` node already exists for TEXT; it gets a 5-line generalization to also concatenate `TOOLS[]`. (No new join node needed.) Type-check at wire-drag time stays as it is — `dataType` strings just have to match.

### `AppTool` companion node

`AppTool` is a small leaf node that **describes** a tool but doesn’t call it. It outputs a single `TOOLS` value:

```
┌────────────────────────────┐
│  Tool: retrieve_corpus     │
│  description: [textarea]   │ ─── tools ──▶
│  schema (JSON):            │
│    [textarea]              │
│  impl: [retrieve ▾]        │   ← chosen from a fixed registry
└────────────────────────────┘
```

`impl` is a **dropdown of built-ins** for v1, not a code box:

| `impl` value | What the agent can do |
|---|---|
| `retrieve` | Internally calls the same `chunkCorpus` + ranker as `AppRetrieve`. The tool gets a `corpus` config. |
| `http_get` | `fetch` of an allow-listed URL. |
| `calc` | Evaluate a numeric expression (no JS `eval`; use a tiny safe parser). |
| `echo` | Returns its input. Good for tests. |

Code-execution, file I/O, and arbitrary tools are **explicitly out of scope** for v1. They each open a security or runtime question that does not belong in a portfolio milestone.

---

## Executor sketch

`engine/executors.ts` gets one new entry, ~80 lines:

```ts
AppAgent: async (node, inputs, onProgress, ctx) => {
  const userPrompt = textFrom(inputs[0])
  const tools      = toolsFrom(inputs[1])           // [] is fine
  const stepBudget = clamp(node.widgetValues[0], 1, 20)
  const model      = String(node.widgetValues[1] ?? 'gpt-4o-mini')
  const system     = String(node.widgetValues[2] ?? '')

  const trace: TraceStep[] = []
  let messages: ChatMsg[] = [
    { role: 'system', content: system },
    { role: 'user',   content: userPrompt },
  ]

  for (let step = 0; step < stepBudget; step++) {
    if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const r = await postAgentStep({ model, messages, tools, signal: ctx.signal })
    onProgress({ kind: 'agent-step', step, summary: r.summary })

    if (r.toolCalls.length === 0) {
      trace.push({ step, kind: 'final' })
      return {
        0: { type: 'TEXT', text: r.content },
        1: { type: 'TEXT', text: renderTrace(trace) },
      }
    }

    messages.push({ role: 'assistant', content: r.content, tool_calls: r.toolCalls })
    for (const call of r.toolCalls) {
      const out = await runBuiltinTool(call, tools, ctx.signal)
      trace.push({ step, kind: 'tool', name: call.name, ok: out.ok, summary: out.summary })
      messages.push({ role: 'tool', tool_call_id: call.id, content: out.text })
    }
  }

  // Budget exhausted: return whatever we have, marked clearly.
  return {
    0: { type: 'TEXT', text: '[budget exhausted]\n\n' + lastAssistantText(messages) },
    1: { type: 'TEXT', text: renderTrace(trace) },
  }
}
```

Notes that matter:

- **`ctx.signal` is honored at every step**, before the request and during the tool call. Esc must cancel an agent run cleanly.
- **Step budget is a hard ceiling**, not a soft suggestion. Default 6, max 20.
- **No streaming** in v1 — agent step responses come back whole. Streaming agent responses is a Path 3 problem.
- **`onProgress`** lets the node UI show *“step 3/6: retrieve_corpus”* in real time.
- The trace is a TEXT output, so it can be wired into another `AppOutput` (or fed back to an LLM for self-review) without any new dataType.

---

## API route

`/api/complete` is single-shot today. The agent loop is server-side **per step**, not server-side as a whole — the client drives the loop so cancellation and step-by-step UI updates are simple. So we add **one** route:

```
POST /api/complete/tools
  body: { model, messages, tools }
  →    { content, tool_calls: [{ id, name, arguments }] }
```

This is a thin proxy over OpenAI’s chat-completions API with `tools` set; we already have the OpenAI client and Zod schema infrastructure from `/api/embed`. `~30` lines.

The built-in tools (`retrieve`, `http_get`, `calc`, `echo`) execute **client-side** during the loop. This keeps the API surface narrow. `http_get` honors a small allow-list pattern (e.g. `^https://` only; no localhost; reject if response > 1 MB) read from the tool config itself.

---

## Cache validity (the subtle bit)

Our partial-run story (`nodeContentStamp` in `partialRunValidation.ts`) assumes a node’s output is a deterministic function of `(type, widgetValues, upstream values)`. **An agent loop is not deterministic** — same inputs, different tool calls, different answers.

Options:

1. **Always invalidate.** Treat `AppAgent` like a node whose stamp is `nanoid()` per run. Run-from-here downstream of an agent works; running *to* an agent never gets to use the agent’s cache. Simplest, honest.
2. **Cache the trace by content stamp.** Same prompt + tools + system + step budget ⇒ replay last trace deterministically. Useful for demos but a lie about how agents work.

**Pick option 1.** Be honest. Add a one-line note in the node body: *“Agent runs are non-deterministic; cache is bypassed.”* That note alone is a good interview talking point.

---

## UI changes

| File | Change |
|---|---|
| `src/data/appTextNodes.ts` | Add `'AppAgent'` and `'AppTool'` to `APP_TEXT_NODE_TYPES` and `APP_INSPECTOR_TYPES`. |
| `src/lib/createAppNode.ts` | Two new cases, mirroring the `AppRetrieve` shape. |
| `src/components/NodePalette.tsx` | Two new buttons. |
| `src/components/NodeComponent.tsx` | New widget renderers: step budget (number), model (select), system (textarea), tool impl (select), schema (textarea). The trace panel is a new sub-component reused between this node and `NodeInspector`. |
| `src/components/NodeInspector.tsx` | Mirrors NodeComponent widgets, plus full trace display. |
| `src/index.css` | A few `agent-trace-*` classes, similar to `retrieve-hit-*`. |

No changes to `runGraph`, `executionStore`, `wireStore`, or `viewportMath`.

---

## Demo graph + URL

`src/data/agentDemoGraph.ts`:

```
[Question]
    │
    ▼
[Agent]   ◀── tools ── [Join]
    │                      ▲
    │             ┌────────┴────────┐
    ▼             │                 │
[Output]    [Tool: retrieve]  [Tool: http_get]
```

Wired into `main.tsx` as `?demo=agent`, and into the toolbar as a **“Agent”** preset button — same pattern as `?demo=rag`.

Out-of-the-box behavior with no API key: the agent step returns `{ tool_calls: [], content: '[no key — agent disabled]' }` and the node finishes immediately with that as the answer. Mirrors the LLM node’s echo-mode story.

---

## Tests

Mirror the existing pattern (`src/engine/executors.appText.test.ts`, `createAppNode.test.ts`):

1. **`createAppNode.test.ts`** — `AppAgent` and `AppTool` produce nodes with the expected ports + widgetValues.
2. **`engine/executors.appAgent.test.ts`**:
   - Mock `postAgentStep`. Verify:
     - 0 tool calls ⇒ single step ⇒ answer + trace.
     - 1 tool call (echo tool) ⇒ 2 steps ⇒ tool output appears in trace.
     - Budget exhausted ⇒ `[budget exhausted]` prefix.
     - `signal.abort()` between steps ⇒ rejects with `AbortError`.
3. **No new e2e**, no Playwright. Same scope as `AppRetrieve` tests.

---

## What it is NOT

- Not a multi-agent platform. One agent per node, one node per agent.
- Not a tool-authoring environment. Tool `impl` is a dropdown of built-ins; arbitrary code is Path 3 (or never).
- Not a chat UI. The agent is one step in a graph; chat history is a v1+ concern.
- Not async / human-in-the-loop. Steps are synchronous to the run.
- Not visible in the editor at edge level. The graph remains a DAG.

---

## Updates required when this lands

- **`README.md`** — add `AppAgent` to the node list and `?demo=agent` to the demos table.
- **`INTERVIEW-technical-challenge-pitch.md`** — one-line bullet under *“What you can credibly say today / Editor / product depth”* mentioning `AppAgent` + tool calling. Per `interview-pitch-sync.mdc`, no more than one line.
- **`09-agents-strategy.md`** — flip Path 2’s status from *“planned”* to *“implemented (date)”* and re-state Gate G2.
- **`SERIOUSNESS-ROADMAP.md`** — no change needed; this falls under #5 (real node) which is already “done.”

---

## Migration / compatibility

Existing graphs are untouched. The new node types `AppAgent` and `AppTool` add to the type union; old saved graphs (in `localStorage`, in JSON exports) deserialize unchanged because they don’t reference the new types. No migration script required.
