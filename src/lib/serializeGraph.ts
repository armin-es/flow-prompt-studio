import { useGraphStore } from '../store/graphStore'
import type { GraphEdge, GraphNode, EdgeId, NodeId } from '../types'

export interface SerializedGraph {
  version: 1
  nodes: [NodeId, GraphNode][]
  edges: [EdgeId, GraphEdge][]
  selection: NodeId[]
  edgeSelection: EdgeId[]
}

export function captureGraph(): SerializedGraph {
  const s = useGraphStore.getState()
  return {
    version: 1,
    nodes: Array.from(s.nodes.entries()),
    edges: Array.from(s.edges.entries()),
    selection: Array.from(s.selection),
    edgeSelection: Array.from(s.edgeSelection),
  }
}

export function applyGraph(data: SerializedGraph): void {
  const nextRev = useGraphStore.getState().graphContentRevision + 1
  useGraphStore.setState({
    nodes: new Map(data.nodes),
    edges: new Map(data.edges),
    selection: new Set(data.selection),
    edgeSelection: new Set(data.edgeSelection),
    graphContentRevision: nextRev,
  })
}

export function graphEquals(a: SerializedGraph, b: SerializedGraph): boolean {
  return (
    JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
    JSON.stringify(a.edges) === JSON.stringify(b.edges) &&
    JSON.stringify(a.selection) === JSON.stringify(b.selection) &&
    JSON.stringify(a.edgeSelection) === JSON.stringify(b.edgeSelection)
  )
}
