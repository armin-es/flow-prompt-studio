import type { GraphEdge, GraphNode } from '../types/index.js'
import { migrateSpamPasteWidgets } from '../engine/spamPasteSource.js'

/** Normalize spam paste nodes (strip legacy input ports; migrate old widget shapes). */
export function normalizeGraphNode(node: GraphNode): GraphNode {
  if (node.type !== 'AppSpamPasteSource') return node
  return {
    ...node,
    inputs: [],
    widgetValues: migrateSpamPasteWidgets(node.widgetValues),
  }
}

/** Spam paste is source-only; drop legacy edges that targeted removed input ports. */
export function dropEdgesTargetingSpamPasteSource(
  edges: Map<string, GraphEdge>,
  nodes: Map<string, GraphNode>,
): void {
  const remove: string[] = []
  for (const [eid, e] of edges) {
    const target = nodes.get(e.targetNodeId)
    if (target?.type === 'AppSpamPasteSource') remove.push(eid)
  }
  for (const eid of remove) edges.delete(eid)
}
