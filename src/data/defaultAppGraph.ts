import type { GraphNode, EdgeId } from '../types'

export interface AppGraphState {
  nodes: GraphNode[]
  edges: Array<{
    id: EdgeId
    sourceNodeId: string
    sourcePortIndex: number
    targetNodeId: string
    targetPortIndex: number
  }>
}

/** Small pipeline: user text → LLM (server) → final TEXT for the result panel. */
export const DEFAULT_APP_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'app-input-1',
      type: 'AppInput',
      label: 'Input',
      position: { x: 60, y: 90 },
      width: 300,
      height: 180,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'In one or two sentences, what is a node graph used for in a visual editor?',
      ],
    },
    {
      id: 'app-llm-1',
      type: 'AppLlm',
      label: 'LLM',
      position: { x: 420, y: 90 },
      width: 300,
      height: 200,
      inputs: [{ name: 'prompt', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['You are a clear, concise assistant. No markdown unless asked.'],
    },
    {
      id: 'app-out-1',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 800, y: 120 },
      width: 300,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'app-edge-1',
      sourceNodeId: 'app-input-1',
      sourcePortIndex: 0,
      targetNodeId: 'app-llm-1',
      targetPortIndex: 0,
    },
    {
      id: 'app-edge-2',
      sourceNodeId: 'app-llm-1',
      sourcePortIndex: 0,
      targetNodeId: 'app-out-1',
      targetPortIndex: 0,
    },
  ],
}
