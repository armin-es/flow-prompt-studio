import type OpenAI from 'openai'
import { topologicalSort } from '../../src/engine/topologicalSort.js'
import type { SerializedGraphJson } from '../db/schema.js'
import type { SpamDb } from '../spam/spamBaselineRules.js'
import { graphMapsFromSerialized } from './parseSerializedGraph.js'
import { getExecutor, type ServerNodeOutput } from './serverExecutors.js'

export type RunSavedGraphOptions = {
  spamItemId?: string
  openai?: OpenAI
  openaiModel?: string
  signal?: AbortSignal
  stageBLlmAugment?: { userPayload: Record<string, unknown> }
}

/** Port outputs keyed as `${nodeId}:${portIndex}` (same convention as the client runner). */
export type RunSavedGraphResult =
  | {
      ok: true
      /** Topological order used for this run */
      order: string[]
      outputs: Map<string, ServerNodeOutput>
    }
  | { ok: false; error: string }

/**
 * Execute a serialized graph on the server using `server/engine/serverExecutors.ts`.
 * Unsupported node types fail with a clear error.
 */
export async function runSavedGraph(
  db: SpamDb,
  userId: string,
  data: SerializedGraphJson,
  options: RunSavedGraphOptions = {},
): Promise<RunSavedGraphResult> {
  const parsed = graphMapsFromSerialized(data)
  if (!parsed.ok) {
    return parsed
  }
  const { nodes, edges } = parsed
  const order = topologicalSort(nodes, edges)
  if (order.length < nodes.size) {
    return {
      ok: false,
      error: 'Graph has a cycle or disconnected nodes; not all nodes can be executed.',
    }
  }

  const edgeList = Array.from(edges.values())
  const nodeOutputs = new Map<string, ServerNodeOutput>()

  const ctx = {
    db,
    userId,
    signal: options.signal,
    spamItemId: options.spamItemId,
    openai: options.openai,
    openaiModel: options.openaiModel,
    stageBLlmAugment: options.stageBLlmAugment,
  }

  try {
    for (const nodeId of order) {
      const node = nodes.get(nodeId)
      if (!node) continue

      const inputs: Record<number, ServerNodeOutput | undefined> = {}
      for (const edge of edgeList.filter((e) => e.targetNodeId === nodeId)) {
        inputs[edge.targetPortIndex] = nodeOutputs.get(
          `${edge.sourceNodeId}:${edge.sourcePortIndex}`,
        )
      }

      const executor = getExecutor(node.type)
      const outputs = await executor(node, inputs, ctx)

      for (const [portStr, value] of Object.entries(outputs)) {
        nodeOutputs.set(`${nodeId}:${portStr}`, value)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }

  return { ok: true, order, outputs: nodeOutputs }
}

/** First matching `AppLlm` output in reverse topological order, or keyed `spam-llm:0`. */
export function getPrimaryAppLlmText(
  data: SerializedGraphJson,
  order: string[],
  outputs: Map<string, ServerNodeOutput>,
): string | null {
  if (outputs.has('spam-llm:0')) {
    const v = outputs.get('spam-llm:0')
    return v?.type === 'TEXT' ? v.text : null
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!
    const nodeEntry = data.nodes.find(([nid]) => nid === id)
    if (!nodeEntry) continue
    const n = nodeEntry[1] as { type?: string }
    if (n.type === 'AppLlm') {
      const v = outputs.get(`${id}:0`)
      if (v?.type === 'TEXT') return v.text
    }
  }
  return null
}
