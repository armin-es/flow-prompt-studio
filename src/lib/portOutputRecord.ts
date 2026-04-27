import type { GraphEdge, NodeId } from '../types'
import type { NodeOutput } from '../store/executionStore'

export function portKey(nodeId: NodeId, portIndex: number): string {
  return `${nodeId}:${portIndex}`
}

/** Build per-node `outputs` map from a flat port key → value record (cache). */
export function outputsMapForNode(
  nodeId: NodeId,
  portOutputs: Record<string, NodeOutput | undefined>,
): Record<number, NodeOutput> {
  const prefix = `${nodeId}:`
  const o: Record<number, NodeOutput> = {}
  for (const k of Object.keys(portOutputs)) {
    if (!k.startsWith(prefix) || !portOutputs[k]) continue
    const idx = Number(k.slice(prefix.length))
    if (Number.isFinite(idx)) o[idx] = portOutputs[k] as NodeOutput
  }
  return o
}

/**
 * If any wire into `downstream` from outside `downstream` is missing a cached
 * port value, return the first missing `nodeId:port` key, else `null`.
 */
export function firstMissingUpstreamPort(
  downstream: Set<NodeId>,
  edges: Map<string, GraphEdge>,
  portOutputs: Record<string, NodeOutput | undefined>,
): string | null {
  for (const e of edges.values()) {
    if (!downstream.has(e.targetNodeId)) continue
    if (downstream.has(e.sourceNodeId)) continue
    const k = portKey(e.sourceNodeId, e.sourcePortIndex)
    if (portOutputs[k] == null) {
      return k
    }
  }
  return null
}
