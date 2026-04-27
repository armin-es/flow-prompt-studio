import { create } from 'zustand'
import type {
  GraphNode,
  GraphEdge,
  NodeId,
  EdgeId,
  ViewportState,
  ComfyWorkflow,
  Point,
} from '../types'
import type { AppGraphState } from '../data/defaultAppGraph'

type SelectNodeOpts = { additive?: boolean; toggle?: boolean }

interface GraphStore {
  /** Bumps only in `loadWorkflow` / `loadAppGraph` / `apply` so the editor can fit after that commit. */
  graphContentRevision: number
  nodes: Map<NodeId, GraphNode>
  edges: Map<EdgeId, GraphEdge>
  viewport: ViewportState
  selection: Set<NodeId>
  edgeSelection: Set<EdgeId>

  setViewport: (v: Partial<ViewportState>) => void
  setNodePosition: (id: NodeId, position: Point) => void
  setNodeSize: (id: NodeId, width: number, height: number) => void
  selectNode: (id: NodeId, opts?: SelectNodeOpts) => void
  selectAllNodes: () => void
  clearSelection: () => void
  selectEdge: (id: EdgeId, opts?: SelectNodeOpts) => void
  clearEdgeSelection: () => void
  setNodeSelection: (ids: Set<NodeId>) => void
  setEdgeSelection: (ids: Set<EdgeId>) => void
  setSelectionInMarquee: (nodeIds: NodeId[], additive: boolean) => void

  addEdge: (edge: GraphEdge) => boolean
  addNode: (node: GraphNode) => void
  removeNode: (id: NodeId) => void
  removeEdge: (id: EdgeId) => void
  /** Removes nodes and all incident edges. */
  removeNodes: (ids: Set<NodeId>) => void
  removeEdges: (ids: Set<EdgeId>) => void
  /** If edges are selected, remove them. Else remove selected nodes (and their edges). */
  deleteSelected: () => void

  loadWorkflow: (workflow: ComfyWorkflow) => void
  loadAppGraph: (graph: AppGraphState) => void
  setNodeWidgetValue: (id: NodeId, index: number, value: unknown) => void
  mergeNodesAndEdges: (addNodes: GraphNode[], addEdges: GraphEdge[], selectNew?: boolean) => void
}

export const useGraphStore = create<GraphStore>()((set, get) => ({
  graphContentRevision: 0,
  nodes: new Map(),
  edges: new Map(),
  viewport: { translateX: 0, translateY: 0, scale: 1 },
  selection: new Set(),
  edgeSelection: new Set(),

  setViewport: (v) =>
    set((state) => ({ viewport: { ...state.viewport, ...v } })),

  setNodePosition: (id, position) =>
    set((state) => {
      const node = state.nodes.get(id)
      if (!node) return {}
      const newNodes = new Map(state.nodes)
      newNodes.set(id, { ...node, position })
      return { nodes: newNodes }
    }),

  setNodeSize: (id, width, height) =>
    set((state) => {
      const node = state.nodes.get(id)
      if (!node) return {}
      const newNodes = new Map(state.nodes)
      newNodes.set(id, { ...node, width, height })
      return { nodes: newNodes }
    }),

  selectNode: (id, opts) =>
    set((state) => {
      const additive = opts?.additive ?? false
      const toggle = opts?.toggle ?? false
      let next = new Set(state.selection)
      if (toggle) {
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
      } else if (additive) {
        next.add(id)
      } else {
        next = new Set([id])
      }
      return {
        selection: next,
        edgeSelection: new Set<EdgeId>(),
      }
    }),

  selectAllNodes: () =>
    set((state) => ({
      selection: new Set(state.nodes.keys()),
      edgeSelection: new Set<EdgeId>(),
    })),

  clearSelection: () => set({ selection: new Set() }),

  clearEdgeSelection: () => set({ edgeSelection: new Set() }),

  selectEdge: (id, opts) =>
    set((state) => {
      const additive = opts?.additive ?? false
      const toggle = opts?.toggle ?? false
      let nextE = new Set(state.edgeSelection)
      if (toggle) {
        if (nextE.has(id)) {
          nextE.delete(id)
        } else {
          nextE.add(id)
        }
      } else if (additive) {
        nextE.add(id)
      } else {
        nextE = new Set([id])
      }
      return {
        edgeSelection: nextE,
        selection: new Set<NodeId>(),
      }
    }),

  setNodeSelection: (ids) =>
    set({ selection: new Set(ids), edgeSelection: new Set<EdgeId>() }),

  setEdgeSelection: (ids) =>
    set({ edgeSelection: new Set(ids), selection: new Set<NodeId>() }),

  setSelectionInMarquee: (nodeIds, additive) =>
    set((state) => {
      const add = new Set(nodeIds)
      if (additive) {
        const s = new Set(state.selection)
        for (const id of add) {
          s.add(id)
        }
        return { selection: s, edgeSelection: new Set<EdgeId>() }
      }
      return { selection: add, edgeSelection: new Set<EdgeId>() }
    }),

  addEdge: (edge) => {
    const state = get()
    for (const e of state.edges.values()) {
      if (
        e.targetNodeId === edge.targetNodeId &&
        e.targetPortIndex === edge.targetPortIndex
      ) {
        return false
      }
    }
    const sn = state.nodes.get(edge.sourceNodeId)
    const tn = state.nodes.get(edge.targetNodeId)
    if (!sn || !tn) {
      return false
    }
    const so = sn.outputs[edge.sourcePortIndex]
    const ti = tn.inputs[edge.targetPortIndex]
    if (so && ti && so.dataType !== ti.dataType) {
      return false
    }
    set((s) => {
      const newEdges = new Map(s.edges)
      newEdges.set(edge.id, edge)
      return { edges: newEdges }
    })
    return true
  },

  addNode: (node) =>
    set((state) => {
      const newNodes = new Map(state.nodes)
      newNodes.set(node.id, node)
      return { nodes: newNodes }
    }),

  removeEdge: (id) =>
    set((state) => {
      if (!state.edges.has(id)) return {}
      const newE = new Map(state.edges)
      newE.delete(id)
      const newSel = new Set(state.edgeSelection)
      newSel.delete(id)
      return { edges: newE, edgeSelection: newSel }
    }),

  removeNode: (id) =>
    set((state) => {
      if (!state.nodes.has(id)) return {}
      const newN = new Map(state.nodes)
      newN.delete(id)
      const newE = new Map(state.edges)
      for (const [eid, e] of newE) {
        if (e.sourceNodeId === id || e.targetNodeId === id) {
          newE.delete(eid)
        }
      }
      const newSel = new Set(state.selection)
      newSel.delete(id)
      return { nodes: newN, edges: newE, selection: newSel }
    }),

  removeNodes: (ids) =>
    set((state) => {
      if (ids.size === 0) return {}
      const newN = new Map(state.nodes)
      for (const id of ids) {
        newN.delete(id)
      }
      const newE = new Map(state.edges)
      for (const [eid, e] of newE) {
        if (ids.has(e.sourceNodeId) || ids.has(e.targetNodeId)) {
          newE.delete(eid)
        }
      }
      const newNSel = new Set([...state.selection].filter((i) => !ids.has(i)))
      return { nodes: newN, edges: newE, selection: newNSel, edgeSelection: new Set<EdgeId>() }
    }),

  removeEdges: (ids) =>
    set((state) => {
      if (ids.size === 0) return {}
      const newE = new Map(state.edges)
      for (const id of ids) {
        newE.delete(id)
      }
      const newESel = new Set([...state.edgeSelection].filter((i) => !ids.has(i)))
      return { edges: newE, edgeSelection: newESel }
    }),

  deleteSelected: () =>
    set((state) => {
      if (state.edgeSelection.size > 0) {
        const newE = new Map(state.edges)
        for (const id of state.edgeSelection) {
          newE.delete(id)
        }
        return { edges: newE, edgeSelection: new Set<EdgeId>() }
      }
      if (state.selection.size === 0) return {}
      const ids = new Set(state.selection)
      return (() => {
        const newN = new Map(state.nodes)
        for (const id of ids) {
          newN.delete(id)
        }
        const newE = new Map(state.edges)
        for (const [eid, e] of newE) {
          if (ids.has(e.sourceNodeId) || ids.has(e.targetNodeId)) {
            newE.delete(eid)
          }
        }
        return {
          nodes: newN,
          edges: newE,
          selection: new Set<NodeId>(),
          edgeSelection: new Set<EdgeId>(),
        }
      })()
    }),

  mergeNodesAndEdges: (addNodes, addEdges, selectNew = true) =>
    set((state) => {
      const newN = new Map(state.nodes)
      for (const n of addNodes) {
        newN.set(n.id, n)
      }
      const newE = new Map(state.edges)
      for (const e of addEdges) {
        newE.set(e.id, e)
      }
      return {
        nodes: newN,
        edges: newE,
        selection: selectNew ? new Set(addNodes.map((n) => n.id)) : state.selection,
        edgeSelection: new Set<EdgeId>(),
        graphContentRevision: state.graphContentRevision + 1,
      }
    }),

  loadWorkflow: (workflow) => {
    const nodes = new Map<NodeId, GraphNode>()
    const edges = new Map<EdgeId, GraphEdge>()

    for (const wn of workflow.nodes) {
      const sizeArr = Array.isArray(wn.size)
        ? wn.size
        : [wn.size[0], wn.size[1]]
      const node: GraphNode = {
        id: String(wn.id),
        type: wn.type,
        label: wn.type,
        position: { x: wn.pos[0], y: wn.pos[1] },
        width: sizeArr[0] ?? 200,
        height: sizeArr[1] ?? 100,
        inputs: (wn.inputs ?? []).map((i) => ({
          name: i.name,
          dataType: i.type,
        })),
        outputs: (wn.outputs ?? []).map((o) => ({
          name: o.name,
          dataType: o.type,
        })),
        widgetValues: wn.widgets_values ?? [],
      }
      nodes.set(node.id, node)
    }

    for (const link of workflow.links) {
      const edge: GraphEdge = {
        id: String(link[0]),
        sourceNodeId: String(link[1]),
        sourcePortIndex: link[2],
        targetNodeId: String(link[3]),
        targetPortIndex: link[4],
      }
      edges.set(edge.id, edge)
    }

    set((state) => ({
      nodes,
      edges,
      selection: new Set(),
      edgeSelection: new Set(),
      viewport:
        workflow.nodes.length === 0
          ? { translateX: 0, translateY: 0, scale: 1 }
          : state.viewport,
      graphContentRevision: state.graphContentRevision + 1,
    }))
  },

  loadAppGraph: (graph) => {
    const nodes = new Map<NodeId, GraphNode>()
    const edges = new Map<EdgeId, GraphEdge>()
    for (const n of graph.nodes) {
      nodes.set(n.id, { ...n })
    }
    for (const e of graph.edges) {
      const edge: GraphEdge = {
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        sourcePortIndex: e.sourcePortIndex,
        targetNodeId: e.targetNodeId,
        targetPortIndex: e.targetPortIndex,
      }
      edges.set(edge.id, edge)
    }
    set((state) => ({
      nodes,
      edges,
      selection: new Set(),
      edgeSelection: new Set(),
      viewport:
        graph.nodes.length === 0
          ? { translateX: 0, translateY: 0, scale: 1 }
          : state.viewport,
      graphContentRevision: state.graphContentRevision + 1,
    }))
  },

  setNodeWidgetValue: (id, index, value) =>
    set((state) => {
      const node = state.nodes.get(id)
      if (!node) return {}
      const next = [...node.widgetValues]
      next[index] = value
      const newNodes = new Map(state.nodes)
      newNodes.set(id, { ...node, widgetValues: next })
      return { nodes: newNodes }
    }),
}))
