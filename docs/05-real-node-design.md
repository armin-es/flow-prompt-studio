# #5 — One “real” node beyond text plumbing

> **Status:** Implemented. **`AppRetrieve`**, `?demo=rag`, toolbar **RAG**, and **`POST /api/embed`** (cosine) are in `main`. This doc is the design record.
>
> **What’s next.** This shipped a *demo-grade* RAG node (in-node corpus ≤ 64 KB, no persistence, no citations). The plan to turn it into a real product (persistent corpora, multi-tenant auth via Clerk, hybrid retrieval, eval harness) lives in [`08-from-demo-to-product.md`](./08-from-demo-to-product.md). Read that before extending this node.

> Goal: stop looking like a graph toy where the only thing that talks to the outside world is the LLM. Add **one** node whose value is obvious to a reviewer in 5 seconds, and that the rest of the graph (Tee/Join/Pick/Prefix/LLM) can wire into without surprises.

There are two candidates. Pick **one**. We will not do both — two unfinished real nodes is worse than one.

| Option | What it does | Why it’s “real” | Cost |
|---|---|---|---|
| **A. HTTP node** | `GET`/`POST` to a URL, return body as `TEXT` (or status only). | Turns the graph into a tiny automation tool. Combines with LLM (“fetch → summarize”). | ~1 day |
| **B. Retrieve / Context node** | Take a `query` TEXT input, return top-K snippets from a small in-memory corpus pinned to the node. | Makes the graph the **RAG shape** every reviewer is looking for. | ~1.5 days |

**Recommendation: B (Retrieve).** A is more generic but blander — reviewers see HTTP nodes in n8n/Zapier all day. Retrieve is the shape that says “this person knows what an LLM app is for in 2026,” and it slots into the existing `AppLlm` node with a Join in front of it, which is already in our preset library.

The rest of this doc is the concrete plan for **B**, with **A** as a fallback in an appendix.

---

## B. Retrieve / Context node

### B.1 What the user sees

A new node `AppRetrieve` in the **Add** palette (label: `Retrieve`).

```
            ┌────────────────────────┐
 query ───▶ │  Retrieve              │ ─── snippets ─▶
            │  k: [3 ▾]              │
            │  corpus: [paste/upload]│
            │  similarity: cosine    │
            │  • [doc1.md (sim 0.83)]│
            │  • [doc4.md (sim 0.71)]│
            │  • [doc2.md (sim 0.55)]│
            └────────────────────────┘
```

- **One TEXT input**: `query`.
- **One TEXT output**: `snippets` — a flat string of the top-K passages, joined with `\n\n---\n\n`, ready to feed an LLM.
- **Inspector widgets**:
  - `k` — number of snippets to return (default 3, min 1, max 10).
  - `corpus` — multiline text. Documents separated by a delimiter (default `\n\n---\n\n`). Each document is title + body or just body.
  - `chunkSize` — characters per chunk (default 800).
  - `chunkOverlap` — characters of overlap (default 100).
  - `similarity` — `bm25` (default) or `cosine` if an embedder URL is configured.
- **On the node body** (compact, after a successful run): the picked top-K shown with title + similarity score, so the run is *visibly* doing retrieval, not just text concat.

### B.2 Why this is the right size

- It is **not** “build a vector DB.” The corpus lives in the node’s `widgetValues`. It is small (≤ 64 KB).
- It is **not** “add an embedder service.” Default ranker is **BM25** (lexical, deterministic, no API key needed). That alone is already useful and demoable in echo mode.
- Optional cosine path uses `OPENAI_API_KEY` (already present) with `text-embedding-3-small`. If no key, fall back to BM25 *with* a banner so reviewers don’t mistake it for failure.

### B.3 Wire-level changes (concrete, file by file)

#### 1. New port type? **No.**
Output stays `TEXT`. Top-K snippets get serialized into one TEXT payload. Keeps it composable with everything we already have (Join, LLM, Output) and avoids touching the executor/port plumbing.

#### 2. `src/data/appTextNodes.ts`
Add `AppRetrieve` to `APP_TEXT_NODE_TYPES` and the inspector list.

#### 3. `src/lib/createAppNode.ts`
Add to `CreatableAppNodeType`. Default widget values:

```ts
case 'AppRetrieve':
  return {
    ...base,
    type: 'AppRetrieve',
    inputs: [{ name: 'query', dataType: TEXT }],
    outputs: [{ name: 'snippets', dataType: TEXT }],
    widgetValues: [
      3,                   // k
      DEFAULT_CORPUS,      // corpus (a small built-in sample)
      800,                 // chunkSize
      100,                 // chunkOverlap
      'bm25',              // similarity: 'bm25' | 'cosine'
    ],
  }
```

`DEFAULT_CORPUS` is a 5-doc string ships with the app (e.g. excerpts of well-known prompt-engineering tips) so a fresh node *runs* without setup.

#### 4. `src/engine/executors.ts`
New executor. Pure function. No network unless `similarity === 'cosine'`.

```ts
AppRetrieve: async (node, inputs, _onProgress, ctx) => {
  const query = textFrom(inputs[0])
  if (!query.trim()) {
    throw new Error('Retrieve: connect a query (TEXT) input.')
  }
  const k = clampK(node.widgetValues[0])
  const corpus = String(node.widgetValues[1] ?? '')
  const chunkSize = Number(node.widgetValues[2] ?? 800)
  const chunkOverlap = Number(node.widgetValues[3] ?? 100)
  const sim = String(node.widgetValues[4] ?? 'bm25')

  const chunks = chunkCorpus(corpus, { chunkSize, chunkOverlap })
  const ranked =
    sim === 'cosine'
      ? await rankByCosine(query, chunks, ctx.signal)  // falls back to bm25 if no key
      : rankByBm25(query, chunks)

  const top = ranked.slice(0, k)
  // Serialize the way LLMs expect: numbered passages with separators.
  const text = top
    .map(
      (r, i) =>
        `# Passage ${i + 1} (score ${r.score.toFixed(2)}; src: ${r.source})\n${r.text}`,
    )
    .join('\n\n---\n\n')
  return { 0: { type: 'TEXT', text } }
},
```

The chunker, BM25, and (optional) cosine ranker live in:

- `src/engine/retrieve/chunk.ts` — character-window chunker with overlap, preserves a `source` (doc title / `doc#index`).
- `src/engine/retrieve/bm25.ts` — small BM25 (k1=1.2, b=0.75), tokenizer is `\W+` lowercased. ~70 LOC. Vitest-friendly.
- `src/engine/retrieve/embed.ts` — calls a new server route; if missing, throws → executor catches and falls back to BM25 with a warning.

#### 5. `server/index.ts`
New route `POST /api/embed` that proxies `OpenAI.embeddings.create` with the same echo/no-key fallback we already use:

```ts
const embedSchema = z.object({ texts: z.array(z.string().min(1)).max(64) })
app.post('/api/embed', async (c) => {
  const { texts } = embedSchema.parse(await c.req.json())
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return c.json({ vectors: null, reason: 'no-key' }, 200)
  }
  const openai = new OpenAI({ apiKey: key })
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })
  return c.json({ vectors: res.data.map((d) => d.embedding) })
})
```

Aborts via `c.req.raw.signal` exactly like `/api/complete/stream`.

#### 6. `src/components/NodeComponent.tsx`
Inspector renders:
- `k` as a number input (1–10),
- `corpus` as a `<textarea>` (height ~ 8 rows),
- `chunkSize` / `chunkOverlap` as number inputs,
- `similarity` as a `<select>` with `bm25` / `cosine`,
- After run, render the **picked snippets list** in the node body (title + score) — small, non-interactive — so a reviewer immediately sees retrieval happening, not just text moving.

#### 7. Demo preset
New file `src/data/ragDemoGraph.ts` and a `?demo=rag` URL handler:

```
[Question (Input)] ──┐
                     ├──▶ [Join] ──▶ [LLM] ──▶ [Output]
[Retrieve] ──────────┘
   ▲
   │ query
[Question (Input)]    ← same Input, via a Tee
```

So the same `Question` text fans out (`Tee`) to both the `Retrieve` node and the LLM prompt. The LLM gets `question + retrieved snippets`. This is the canonical RAG shape and uses **all four** existing utility nodes (Tee, Join, plus Input/Output and now Retrieve).

Add a button to the toolbar: **RAG**.

#### 8. README + INTERVIEW pitch
- README: add `Retrieve` to the App-node table, document the URL: `?demo=rag`, document `OPENAI_API_KEY` (already documented) and that it’s **not required** because BM25 is the default.
- INTERVIEW: add a bullet under “Editor / product depth” — “Retrieve node: BM25 by default, optional cosine via `/api/embed`, demoable without a key.” Cursor rule already keeps these in sync.

### B.4 Tests

Vitest (pure):
- `bm25.test.ts` — same query, 3 docs, expected ranking; tokenizer edge cases; `b` and `k1` math sanity.
- `chunk.test.ts` — overlap correctness, preserves source ids, no double-emission at boundary.
- `appRetrieve.executor.test.ts` — given a corpus + query, deterministic top-K via BM25; `cosine` path falls back to BM25 if `embed` returns `vectors: null`.

Playwright (one):
- `?demo=rag` → set Question to “What is BM25?” → **Run** → Output contains both `Passage 1` and one of the seeded BM25-friendly tokens.

### B.5 What this fixes about “toy”

- Reviewer can run a **RAG flow** with **no setup** (BM25 + built-in corpus). That’s the demo.
- The graph editor is now doing something an LLM app actually does, not just passing strings.
- It exercises **partial runs** in a way that finally tells the right story: edit the **system prompt** of the LLM → ⏩ **From here** is valid → the expensive step (Retrieve) is cached. That’s the original bug we fixed; this is the demo where the fix matters.

### B.6 Explicit non-goals

- No vector DB. No persistence of embeddings across sessions. (We can mention persistence as “next step” in INTERVIEW.)
- No file upload UI. Corpus is paste-in. (One drag-drop is fine if cheap.)
- No reranker. No hybrid search beyond BM25 + cosine.
- Corpus is hard-capped (e.g. 64 KB). Past that, refuse with a clear inspector error rather than silently truncating.

### B.7 Sequencing (so it ships in pieces)

1. `bm25.ts` + `chunk.ts` + their tests. (Half day; lands without UI.)
2. `AppRetrieve` executor + node factory + inspector widgets. (Half day; demoable end-to-end with built-in corpus.)
3. `?demo=rag` preset + RAG button. (1–2 hours.)
4. Optional: `/api/embed` + cosine path. (Half day; gated on `OPENAI_API_KEY`.)
5. Playwright smoke. (1–2 hours, alongside the smoke from #2 of the main roadmap.)

If time runs out before step 4, ship 1–3. **BM25 alone is enough to look serious**, and the cosine path is incremental.

---

## A. HTTP node (fallback)

If we go this route instead of B:

- Node `AppHttp` with widgets: `method` (`GET`/`POST`), `url`, `headers` (KV textarea), `body` (textarea, only for `POST`), `timeoutMs`, `parseAs` (`text` | `json.path`).
- Single TEXT input (optional) → spliced into the URL/body via `${input}` template, so `Input → HTTP` actually does something dynamic.
- Output: TEXT (response body). For `json.path`, run a tiny pointer (`a.b.0.c`) against the parsed body before stringifying.
- Server route: `POST /api/http` proxies the call (so we don’t need CORS). Reuse the same abort plumbing as the streaming endpoint.
- Demo: **Translate the headline of an RSS feed**. `Input("https://…/rss.xml") → HTTP(GET, parseAs=text) → LLM(system: extract first <title>, translate to FR) → Output`. That’s a one-screen demo of why the graph exists.

Tests: same shape (chunker → bm25 → executor become http parser → executor; one Playwright smoke).

Why it’s the fallback: more generic, less specific to the LLM-app world. Pick A only if the **HTTP demo idea** is more compelling to *you* than the RAG demo, because the demo is what reviewers will see.

---

## After this lands

The pitch becomes: **graph editor + run engine + partial-run cache + a RAG node with BM25 by default**. That is no longer a toy. It is a small, focused tool with a real use case, demoable in 30 seconds on a public URL with no API key. The remaining roadmap items (#1 deploy, #2 Playwright, #4 CI badge, #7 README+GIF) become much more believable once a reviewer has actually retrieved a passage in the live demo.
