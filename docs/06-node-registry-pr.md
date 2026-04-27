# PR plan: Introduce node registry

> Goal: collapse the “five-file shotgun for every node type” into **one file per node**. No behavior change. After this PR, adding `AppRetrieve` (or any future node) is a single new file under `src/nodes/` plus tests.

This is a **refactor-only** PR. No new features, no UX changes, no demo changes. CI must stay green at every commit.

---

## What lives in the registry

```ts
// src/nodes/types.ts
import type { GraphNode, PortSchema } from '../types'
import type { ExecutorFn, NodeOutput } from '../engine/executors'
import type { ReactNode } from 'react'

export type WidgetSpec =
  | { key: string; kind: 'text';     default: string;  placeholder?: string }
  | { key: string; kind: 'textarea'; default: string;  rows?: number; maxBytes?: number }
  | { key: string; kind: 'number';   default: number;  min?: number; max?: number; step?: number }
  | { key: string; kind: 'select';   default: string;  options: readonly string[] }

export interface NodeKindSpec {
  /** Stable string used in serialized graphs and `GraphNode.type`. */
  type: string
  label: string
  /** Where it shows up in the Add palette. */
  category: 'app' | 'comfy'
  /** Whether the **Add** palette can spawn it. (Comfy types are loaded only via import.) */
  spawnable: boolean
  defaultSize: { width: number; height: number }
  ports: { inputs: PortSchema[]; outputs: PortSchema[] }
  /** Source of truth for both the inspector and node body widgets. */
  widgets: readonly WidgetSpec[]
  execute: ExecutorFn
  /** Optional small custom body renderer (e.g. LLM streamed text, Pick chosen branch). */
  renderBody?: (ctx: NodeRenderCtx) => ReactNode
  /** Optional inspector override; default uses `widgets[]`. */
  renderInspector?: (ctx: NodeRenderCtx) => ReactNode
}

export interface NodeRenderCtx {
  node: GraphNode
  /** Already typed: keys come from `widgets[]`. */
  widgets: Record<string, unknown>
  /** Returns true if the value is valid (range / maxBytes); used for inline error styling. */
  setWidget: (key: string, value: unknown) => boolean
  outputs?: Record<number, NodeOutput>
}
```

**Default widget values** are derived from `widgets.map(w => w.default)` so registry entries can’t drift from `GraphNode.widgetValues`. Reads/writes go through a typed accessor:

```ts
// src/nodes/widgetAccess.ts
export function readWidgets(node: GraphNode, widgets: readonly WidgetSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  widgets.forEach((w, i) => { out[w.key] = node.widgetValues[i] ?? w.default })
  return out
}
```

`GraphNode.widgetValues: unknown[]` stays as the on-disk format (so existing graph JSON still loads, and `partialRunValidation`’s content stamps still work unchanged).

---

## File-by-file plan

### Add

```
src/nodes/types.ts                ← interfaces above
src/nodes/widgetAccess.ts         ← readWidgets / setWidget helpers
src/nodes/registry.ts             ← NODE_REGISTRY, getKind(type)
src/nodes/AppInput.ts
src/nodes/AppLlm.ts
src/nodes/AppOutput.ts
src/nodes/AppJoin.ts
src/nodes/AppTee.ts
src/nodes/AppPrefix.ts
src/nodes/AppPick.ts
src/nodes/Comfy.ts                ← all 7 Comfy types in one file (legacy demo only)
src/nodes/__tests__/registry.test.ts
src/components/widgets/WidgetField.tsx   ← renders a single WidgetSpec
src/components/widgets/WidgetList.tsx    ← renders all widgets[] for a node
```

### Modify

- `src/lib/createAppNode.ts` → ~10 lines. Looks up `getKind(type)` and builds a `GraphNode` from `defaultSize` / `ports` / default widget values. The big switch and the `defaultLabel` / `defaultWidth` / `defaultHeight` helpers all delete.
- `src/engine/executors.ts` → keep `ExecutorFn` and `textFrom`, but `getExecutor` becomes:
  ```ts
  import { getKind } from '../nodes/registry'
  const fallback: ExecutorFn = async () => ({})
  export function getExecutor(type: string): ExecutorFn {
    return getKind(type)?.execute ?? fallback
  }
  ```
  All concrete executor bodies move into the per-node files. `executors.appText.test.ts` keeps importing `getExecutor` — no test changes.
- `src/data/appTextNodes.ts` → either deleted (callers switch to `listSpawnable('app')` from the registry) or thinned to just re-export those lists from the registry for backward compat. Prefer deletion.
- `src/components/NodeComponent.tsx` →
  - Body widget rendering: replace per-type branches with `<WidgetList node={node} widgets={kind.widgets} />`.
  - Custom bodies (LLM streamed output, Pick chosen branch indicator, future Retrieve snippet list) call `kind.renderBody?.(ctx)` if defined.
- `src/components/NodeInspector.tsx` → same treatment: default uses `<WidgetList />`, falls back to `kind.renderInspector?.(ctx)` when present.
- `src/components/NodePalette.tsx` → builds buttons from `listSpawnable('app')` instead of an imported constant.
- `src/engine/runGraph.ts` → **no changes in this PR.** (The executor-context generalization lands later, with #5.)

### Don’t touch

- `src/store/*` — no schema change.
- `src/lib/partialRunValidation.ts` — stamps still hash `widgetValues`, which is the same shape.
- `src/lib/serializeGraph.ts` — same on-disk format.
- `server/*` — unchanged.

---

## Per-node file shape (one example)

```ts
// src/nodes/AppJoin.ts
import type { NodeKindSpec } from './types'
import { textFrom } from '../engine/executors'

export const AppJoinSpec: NodeKindSpec = {
  type: 'AppJoin',
  label: 'Join',
  category: 'app',
  spawnable: true,
  defaultSize: { width: 280, height: 150 },
  ports: {
    inputs: [
      { name: 'a', dataType: 'TEXT' },
      { name: 'b', dataType: 'TEXT' },
    ],
    outputs: [{ name: 'out', dataType: 'TEXT' }],
  },
  widgets: [
    {
      key: 'separator',
      kind: 'text',
      default: '\n',
      placeholder: 'separator (default: newline)',
    },
  ],
  execute: async (node, inputs) => {
    const sep = String(node.widgetValues[0] ?? '\n')
    return { 0: { type: 'TEXT', text: `${textFrom(inputs[0])}${sep}${textFrom(inputs[1])}` } }
  },
}
```

`AppLlm.ts` keeps its custom `renderBody` so the streamed text + `Last run` indicator UI stays the same. `AppPick.ts` keeps a custom inspector if there’s a non-trivial control. Otherwise, every other node uses defaults.

---

## Migration order (each commit ships green)

1. **Add registry skeleton + `WidgetList` + 1 spec (`AppJoin`).** `getExecutor`/`createAppNode` get a *fallback* path: try registry first, fall back to the old switch. All tests still pass because nothing else has migrated.
2. **Migrate the trivial nodes one at a time**, in this order, each its own commit: `AppTee`, `AppPrefix`, `AppPick`, `AppOutput`, `AppInput`. After each, delete that node’s case from the old switches.
3. **Migrate `AppLlm`.** This is the only complex one (custom render body for streamed text, custom error formatting). Keep its `renderBody` exact match to the current `NodeComponent` branch.
4. **Migrate Comfy types** in one commit (`Comfy.ts`). They’re all decorative for the legacy import demo; one file is fine.
5. **Delete the fallback** in `createAppNode.ts` and `executors.ts`. Delete `appTextNodes.ts`.
6. **Move `NodeComponent` body and `NodeInspector`** to use the registry. Delete the old per-type branches.
7. **Add `src/nodes/__tests__/registry.test.ts`**: every `NODE_REGISTRY` entry has unique `type`, `widgets[]` keys are unique within an entry, `defaultSize` is reasonable, `execute` is a function. (Cheap drift catcher.)

After step 7, search the codebase for `node.type ===` and `widgetValues[` outside `src/nodes/` — should be ~zero results. That’s the success metric.

---

## What the diff statistics will look like (rough)

- ~10 new files under `src/nodes/`.
- `createAppNode.ts`: ~170 → ~30 lines.
- `executors.ts`: ~190 → ~25 lines (just `ExecutorFn`, `textFrom`, `getExecutor`).
- `appTextNodes.ts`: deleted.
- `NodeComponent.tsx`: removes ~80 lines of per-type widget rendering, gains `<WidgetList />`.
- `NodeInspector.tsx`: removes ~60 lines of per-type widget rendering.

Net **negative line count**, with all logic in one place per node. That’s the kind of refactor reviewers like.

---

## What this unlocks

- **#5 (Retrieve)** is one new file: `src/nodes/AppRetrieve.ts` (registry entry + executor) + `renderBody` for the snippet list. Plus `src/engine/retrieve/{bm25,chunk,embed}.ts` and their tests. No edits to `createAppNode`, `executors`, `NodeComponent`, `NodeInspector`, or `appTextNodes`.
- A **public node API**: even if you don’t want plugins, a reviewer reading `src/nodes/AppJoin.ts` immediately understands the architecture.
- A path to **server-shared schemas** later: the same `WidgetSpec[]` can drive Zod validation on a future `POST /api/run` endpoint without a second source of truth.

---

## What this does *not* do (deliberate non-goals)

- Does not introduce a discriminated-union `NodeOutput`. (Defer until Retrieve / future nodes need it.)
- Does not split per-port output schemas. (`PortSchema` already has `dataType`; that’s enough.)
- Does not add a plugin loader or runtime registration. The registry is a static object literal.
- Does not change how widgets are stored (`widgetValues: unknown[]` stays).
- Does not generalize the executor streaming context (`onStreamText`). That’s a separate ~2-hour change, easier to land **with #5**.
