export type NodeId = string
export type EdgeId = string
export type PortId = string

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PortSchema {
  name: string
  dataType: string
}

export interface GraphNode {
  id: NodeId
  type: string
  label: string
  position: Point
  width: number
  height: number
  inputs: PortSchema[]
  outputs: PortSchema[]
  widgetValues: unknown[]
}

export interface GraphEdge {
  id: EdgeId
  sourceNodeId: NodeId
  sourcePortIndex: number
  targetNodeId: NodeId
  targetPortIndex: number
}

export interface ViewportState {
  translateX: number
  translateY: number
  scale: number
}

// ComfyUI workflow JSON format
export interface ComfyWorkflowNode {
  id: number
  type: string
  pos: [number, number]
  size: { 0: number; 1: number } | [number, number]
  inputs?: { name: string; type: string; link: number | null }[]
  outputs?: { name: string; type: string; links: number[] }[]
  widgets_values?: unknown[]
}

export interface ComfyWorkflowLink {
  // [link_id, source_node_id, source_slot, target_node_id, target_slot, type]
  0: number
  1: number
  2: number
  3: number
  4: number
  5: string
}

export interface ComfyWorkflow {
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
}
