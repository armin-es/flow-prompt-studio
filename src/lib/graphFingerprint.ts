import type { GraphEdge, GraphNode, NodeId } from '../types'

/**
 * Opaque id for the graph’s **wiring and node data** (ids, types, widgets,
 * edge keys) — not viewport position, so you can re-run from a node after
 * panning. Widget edits change this string so the output cache is
 * re-validated only after a full run.
 */
export function graphFingerprint(
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
): string {
  const nodeSigs = [...nodes.values()]
    .map(
      (n) =>
        `${n.id}\0${n.type}\0${JSON.stringify(n.widgetValues)}`,
    )
    .sort()
    .join('\n')
  const e = [...edges.keys()].sort().join('\0')
  return `N:${nodeSigs}|E:${e}`
}
