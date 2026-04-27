import type { AppGraphState } from './defaultAppGraph'

/**
 * **Task** + **context** → **AppJoin** (single combined prompt) → **AppLlm** → **AppOutput**.
 * Shows the usual “merge sources before the model” pattern (RAG- or style-shaped).
 */
export const JOIN_LLM_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'join-llm-task',
      type: 'AppInput',
      label: 'Task',
      position: { x: 40, y: 40 },
      width: 300,
      height: 150,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'Summarize the following in two sentences, focusing on why wiring matters.',
      ],
    },
    {
      id: 'join-llm-ctx',
      type: 'AppInput',
      label: 'Context',
      position: { x: 40, y: 230 },
      width: 300,
      height: 180,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'A node graph in a visual editor connects outputs to inputs. Join merges several TEXT sources into one string before a downstream block (e.g. an LLM) runs once.',
      ],
    },
    {
      id: 'join-llm-join',
      type: 'AppJoin',
      label: 'Join',
      position: { x: 400, y: 120 },
      width: 300,
      height: 150,
      inputs: [
        { name: 'a (task)', dataType: 'TEXT' },
        { name: 'b (context)', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['\n\n---\n\n'],
    },
    {
      id: 'join-llm-llm',
      type: 'AppLlm',
      label: 'LLM',
      position: { x: 760, y: 100 },
      width: 300,
      height: 200,
      inputs: [{ name: 'prompt', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'You are a helpful assistant. Answer using only the information in the user message; be concise.',
      ],
    },
    {
      id: 'join-llm-out',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 1120, y: 130 },
      width: 300,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'join-llm-e1',
      sourceNodeId: 'join-llm-task',
      sourcePortIndex: 0,
      targetNodeId: 'join-llm-join',
      targetPortIndex: 0,
    },
    {
      id: 'join-llm-e2',
      sourceNodeId: 'join-llm-ctx',
      sourcePortIndex: 0,
      targetNodeId: 'join-llm-join',
      targetPortIndex: 1,
    },
    {
      id: 'join-llm-e3',
      sourceNodeId: 'join-llm-join',
      sourcePortIndex: 0,
      targetNodeId: 'join-llm-llm',
      targetPortIndex: 0,
    },
    {
      id: 'join-llm-e4',
      sourceNodeId: 'join-llm-llm',
      sourcePortIndex: 0,
      targetNodeId: 'join-llm-out',
      targetPortIndex: 0,
    },
  ],
}
