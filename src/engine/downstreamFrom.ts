import type { GraphEdge, GraphNode, NodeId } from '../types'

/** All node ids reachable from `startId` by following edges source → target (including `startId`). */
export function nodesDownstreamFrom(
  startId: NodeId,
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
): Set<NodeId> {
  if (!nodes.has(startId)) {
    return new Set()
  }
  const out = new Set<NodeId>([startId])
  const q: NodeId[] = [startId]
  const edgeList = Array.from(edges.values())
  while (q.length > 0) {
    const id = q.shift()!
    for (const e of edgeList) {
      if (e.sourceNodeId === id && !out.has(e.targetNodeId)) {
        out.add(e.targetNodeId)
        q.push(e.targetNodeId)
      }
    }
  }
  return out
}
