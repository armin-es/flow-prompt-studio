import type { GraphEdge, GraphNode, EdgeId, NodeId } from '../types'

export type ClipboardPayloadV1 = {
  version: 1
  nodes: GraphNode[]
  edges: Array<{
    id: EdgeId
    sourceNodeId: NodeId
    sourcePortIndex: number
    targetNodeId: NodeId
    targetPortIndex: number
  }>
}

let memory: ClipboardPayloadV1 | null = null

export function copySelection(
  getNodes: () => Map<NodeId, GraphNode>,
  getEdges: () => Map<EdgeId, GraphEdge>,
  selected: Set<NodeId>,
): void {
  if (selected.size === 0) {
    memory = null
    return
  }
  const nset = new Set(selected)
  const nodes: GraphNode[] = []
  for (const id of nset) {
    const n = getNodes().get(id)
    if (n) nodes.push(structuredClone(n))
  }
  const edges: ClipboardPayloadV1['edges'] = []
  for (const e of getEdges().values()) {
    if (nset.has(e.sourceNodeId) && nset.has(e.targetNodeId)) {
      edges.push({ ...e })
    }
  }
  memory = { version: 1, nodes, edges }
}

export function getClipboard(): ClipboardPayloadV1 | null {
  return memory
}

function newId(m: Map<string, string>, old: string): string {
  if (!m.has(old)) m.set(old, crypto.randomUUID())
  return m.get(old)!
}

/** Offset pasted nodes; remap edge endpoints to new node ids. */
export function buildPasteFromBuffer(
  payload: ClipboardPayloadV1,
  offset: { x: number; y: number },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idMap = new Map<string, string>()
  const nodes: GraphNode[] = payload.nodes.map((n) => {
    const id = newId(idMap, n.id)
    return {
      ...structuredClone(n),
      id,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
    }
  })
  const edges: GraphEdge[] = payload.edges.map((e) => ({
    id: crypto.randomUUID(),
    sourceNodeId: idMap.get(e.sourceNodeId) ?? e.sourceNodeId,
    sourcePortIndex: e.sourcePortIndex,
    targetNodeId: idMap.get(e.targetNodeId) ?? e.targetNodeId,
    targetPortIndex: e.targetPortIndex,
  }))
  return { nodes, edges }
}
