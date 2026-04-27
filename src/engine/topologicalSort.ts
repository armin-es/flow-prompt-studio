import type { GraphEdge, GraphNode, NodeId } from '../types'

/**
 * Kahn's algorithm — BFS-based topological sort.
 * Returns node IDs in execution order (upstream before downstream).
 * If the graph has a cycle, the returned list will be shorter than the node count.
 */
export function topologicalSort(
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
): NodeId[] {
  const edgeList = Array.from(edges.values())
  const nodeIds = Array.from(nodes.keys())

  const inDegree = new Map<NodeId, number>()
  const adjacency = new Map<NodeId, NodeId[]>()

  for (const id of nodeIds) {
    inDegree.set(id, 0)
    adjacency.set(id, [])
  }

  for (const edge of edgeList) {
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1)
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId)
  }

  // Start with all nodes that have no incoming edges
  const queue: NodeId[] = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
  const result: NodeId[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    result.push(id)
    for (const downstream of adjacency.get(id) ?? []) {
      const deg = (inDegree.get(downstream) ?? 0) - 1
      inDegree.set(downstream, deg)
      if (deg === 0) queue.push(downstream)
    }
  }

  return result
}
