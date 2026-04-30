import { z } from 'zod'
import type { SerializedGraphJson } from '../db/schema.js'
import type { GraphEdge, GraphNode } from '../../src/types/index.js'

const portSchema = z.object({
  name: z.string(),
  dataType: z.string(),
})

const graphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  width: z.number(),
  height: z.number(),
  inputs: z.array(portSchema),
  outputs: z.array(portSchema),
  widgetValues: z.array(z.unknown()),
})

const graphEdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  sourcePortIndex: z.number(),
  targetNodeId: z.string(),
  targetPortIndex: z.number(),
})

export function graphMapsFromSerialized(
  data: SerializedGraphJson,
): { ok: true; nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge> } | { ok: false; error: string } {
  if (data.version !== 1) {
    return { ok: false, error: `Unsupported graph version: ${data.version}` }
  }
  const nodes = new Map<string, GraphNode>()
  for (const [nid, raw] of data.nodes) {
    const p = graphNodeSchema.safeParse(raw)
    if (!p.success) {
      return { ok: false, error: `Invalid node ${nid}: ${p.error.message}` }
    }
    const gn = p.data as GraphNode
    if (gn.id !== nid) {
      return { ok: false, error: `Node id mismatch: key ${nid} vs node.id ${gn.id}` }
    }
    nodes.set(nid, gn)
  }
  const edges = new Map<string, GraphEdge>()
  for (const [eid, raw] of data.edges) {
    const p = graphEdgeSchema.safeParse(raw)
    if (!p.success) {
      return { ok: false, error: `Invalid edge ${eid}: ${p.error.message}` }
    }
    const ge = p.data as GraphEdge
    if (ge.id !== eid) {
      return { ok: false, error: `Edge id mismatch: key ${eid} vs edge.id ${ge.id}` }
    }
    edges.set(eid, ge)
  }
  return { ok: true, nodes, edges }
}
