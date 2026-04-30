import type { GraphEdge, GraphNode, NodeId } from '../types'
import { nodesDownstreamFrom } from '../engine/downstreamFrom'
import { portKey } from './portOutputRecord'
import type { NodeOutput } from '../store/executionStore'
import { useCorpusStore } from '../store/corpusStore'

/**
 * String that must match for a cached **upstream** port to stay valid: any
 * change to the node’s `type` or `widgetValues` (prompt, system, etc.) bumps
 * this, but edits on **downstream** only nodes in a “from here” run do not
 * invalidate *other* nodes’ cache entries.
 */
export function nodeContentStamp(n: GraphNode): string {
  if (n.type === 'AppRetrieve') {
    const w = n.widgetValues
    const id = String(w[1] ?? 'corpus-default')
    const part = useCorpusStore.getState().getStampPart(id)
    return `AppRetrieve\0${JSON.stringify([w[0], id, w[2], w[3], w[4]])}\0${part}`
  }
  if (n.type === 'AppAgent') {
    return `AppAgent\0${JSON.stringify(n.widgetValues)}\0__volatile__`
  }
  if (n.type === 'AppSpamRules' || n.type === 'AppSpamItemSource') {
    return `${n.type}\0__volatile__`
  }
  return `${n.type}\0${JSON.stringify(n.widgetValues)}`
}

export function buildNodeStampsForGraph(
  nodes: Map<NodeId, GraphNode>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of nodes.values()) {
    if (n.type === 'AppAgent') {
      const suffix =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `run-${Date.now()}`
      out[n.id] = `AppAgent\0${JSON.stringify(n.widgetValues)}\0${suffix}`
    } else if (n.type === 'AppSpamRules' || n.type === 'AppSpamItemSource') {
      const suffix =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `run-${Date.now()}`
      out[n.id] = `${n.type}\0${suffix}`
    } else {
      out[n.id] = nodeContentStamp(n)
    }
  }
  return out
}

/**
 * @returns `null` if a partial run from `fromId` is allowed; else a
 * user-facing error string.
 */
export function whyPartialRunInvalid(
  fromId: NodeId,
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
  portOutputs: Record<string, NodeOutput | undefined>,
  cachedStamps: Record<string, string>,
): string | null {
  if (Object.keys(portOutputs).length === 0) {
    return 'No saved port outputs. Run the full graph once (Run button).'
  }
  if (Object.keys(cachedStamps).length === 0) {
    return 'Output cache is from an older version. Run the full graph once (Run button).'
  }
  if (!nodes.has(fromId)) {
    return 'Selected node is not in the graph.'
  }
  const downstream = nodesDownstreamFrom(fromId, nodes, edges)
  for (const e of edges.values()) {
    if (!downstream.has(e.targetNodeId)) {
      continue
    }
    if (downstream.has(e.sourceNodeId)) {
      continue
    }
    const k = portKey(e.sourceNodeId, e.sourcePortIndex)
    if (portOutputs[k] == null) {
      return `Missing cached output for ${k}. Run the full graph once.`
    }
    const sourceNode = nodes.get(e.sourceNodeId)
    if (!sourceNode) {
      return 'Graph edge references a missing node.'
    }
    const want = nodeContentStamp(sourceNode)
    const got = cachedStamps[e.sourceNodeId]
    if (got == null) {
      return 'Stale cache. Run the full graph once (Run button).'
    }
    if (got !== want) {
      return `A node that feeds this run was edited (upstream of “from here”). Run the full graph once, or only change this node and nodes below it, then use From here.`
    }
  }
  return null
}
