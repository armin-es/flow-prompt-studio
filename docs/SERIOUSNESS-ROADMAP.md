# Seriousness assessment + improvement roadmap

> Status (April 2026): **Between “toy” and “serious”.** The graph editor and run engine are real engineering; the surrounding product polish (deploy, integration tests, an actually-useful node, README) is what makes reviewers treat it as a **portfolio project** instead of a learning exercise.

This file is the **honest** version of the README. Keep it under `docs/` (private context for the owner / interview prep), not in the public README.

---

## What can be defended today

- **Graph editor** — pan/zoom, ports/edges in graph space, marquee, drag-to-connect (with port-type check), undo/redo with snapshots, copy/paste, delete, export/import, keyboard.
- **Runtime** — topological execution, per-node states, **SSE-streamed** LLM tokens, **AbortController** cancel, **rAF**-batched store updates, error boundary.
- **Partial runs** — per-node content stamps + crossing-wire validation, with Vitest coverage.
- **Perf** — pan/zoom no longer re-renders nodes (subscribe + rAF to `portPositionStore`); Stress 200 to demo it.
- **Topology** — Tee/Join/Pick/Prefix + presets (App pipeline / Tee/Join / Pick 2→1 / Join+LLM); **Add** palette for authoring from scratch.

That is a real software project, not a tutorial. The “toy” signal is everywhere else.

---

## Why it still reads as “toy” to a reviewer

A reviewer typically spends 60–120 s on a portfolio link. With the project as it is they will see:

- **No public URL** — they will not run it locally; nothing to look at.
- **Tests are pure helpers** — math, sort, validation. No editor / integration tests.
- **No CI badge** — looks unmaintained even when it isn’t.
- **README is notes, not a product page** — no GIF, no diagram, “run locally” at the top.
- **Nodes are decorative** — Tee/Join/Pick/Prefix look like wiring fixtures, not a thing the user *needs*; the LLM node is the only one that does external work.
- **Error / no-API-key paths are not explicit** — reviewers can mistake echo mode for a bug.

---

## Improvements (highest leverage first)

### 1. Deploy a public URL
- Vercel (UI) + Render (API) using the existing `vercel.json` / `render.yaml` / `DEPLOY.md`.
- **Echo mode** when no `OPENAI_API_KEY` so it works without secrets.
- One link in the resume changes the whole perception.

### 2. Tests where it counts
- **One Playwright smoke**: `?demo=joinllm` → **Run** → Output node has text → edit downstream → ⏩ **From here** uses cache.
- **Editor integration** with `@testing-library/react`:
  - drag-to-connect rejects mismatched `dataType`,
  - **Add** spawns a node,
  - **Delete** removes node + edges,
  - **From here** disabled with the right reason in the tooltip until a full run.
- Existing Vitest stays for pure functions.

### 3. Error and loading paths look real
- Mark **echo mode** in the LLM node + **Last run** so reviewers know it’s by design.
- **Network error**: clear retry hint and button in **Last run**, not a stack trace.
- **Share link**: `?save=…` URL or “Copy share link” that round-trips the current graph (small JSON → base64).

### 4. CI badge
- GitHub Actions: typecheck + tests + build on PRs.
- Vercel preview link in PR comments.

### 5. One “real” node beyond text plumbing
**Pick one** (see expansion below).
- **HTTP node** — generic, makes the engine feel like an automation tool.
- **Retrieve / Context node** — gives the graph the **RAG shape** without overpromising.

> **Status:** done — `AppRetrieve` shipped (see `05-real-node-design.md`). The next question is *“how do we make it actually usable?”* — that plan lives in `08-from-demo-to-product.md` (persistence, multi-tenancy, real chunking, citations, eval harness). Read that one before starting any of the substages below.

### 6. Editor polish that closes obvious gaps
Things a reviewer notices in 30 s:
- **Right-click on a node** — delete / duplicate / disconnect (keyboard exists; menus are discoverable).
- **Edge selection** affordance (hover thicker) and Backspace on selected edges.
- **Wire-rejected feedback** (brief flash on the target port when port types don’t match).
- **Empty state** explains the **Add** palette in one line.

### 7. README that reads like a product
- **Top of file**: 12–25 s GIF (load Join+LLM → Run → edit system → From here → result).
- **Architecture** Mermaid diagram (graph store, execution store, port store, run engine, API route).
- **Trade-offs explicitly** (no virtualization yet, no server persistence, echo mode).
- Move `INTERVIEW-technical-challenge-pitch.md` under `docs/` (it is prep, not docs).

### 8. (Optional, only if you want unambiguously serious)
- **Schema for ports/widgets per node type** with Zod runtime validation; share between executors, `createAppNode`, and the inspector.
- **Server-side schema for runs** (`/api/run` taking a small graph, not just one prompt). Mention as a “next step” unless you want to implement.

---

## Things to *not* do
- More text-only demos (point already made).
- A second LLM provider (no signal).
- Mobile UX (audience is desktop reviewers).

---

## 1–2-evening plan if you want to ship the “serious” bar
1. Deploy + public URL in README.
2. One Playwright smoke for `?demo=joinllm`.
3. Top-of-README GIF + tiny Mermaid diagram.
4. CI: typecheck + tests + build.
5. One real node (HTTP or Retrieve), one happy-path test.

> If only one of these gets done, do **#1**. The rest land harder once a reviewer is already on the live URL.
