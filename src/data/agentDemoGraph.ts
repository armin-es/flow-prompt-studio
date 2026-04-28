import type { AppGraphState } from './defaultAppGraph'
import { CORPUS_DEFAULT_ID } from '../store/corpusStore'

/**
 * Question → **Agent** ← tools merged from **retrieve** + **echo** Tool leaves → **Output**.
 * With no API key, the agent answers from `[no key — agent disabled]` (same story as LLM echo).
 */
export const AGENT_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'agent-input',
      type: 'AppInput',
      label: 'Question',
      position: { x: 40, y: 120 },
      width: 300,
      height: 160,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'What is BM25? Call retrieve_passages with a short query, then answer in one sentence.',
      ],
    },
    {
      id: 'agent-tool-retrieve',
      type: 'AppTool',
      label: 'Tool: retrieve',
      position: { x: 40, y: 340 },
      width: 300,
      height: 340,
      inputs: [],
      outputs: [{ name: 'tools', dataType: 'TOOLS' }],
      widgetValues: [
        'retrieve_passages',
        'Runs BM25 retrieval over the named corpus and returns numbered passages.',
        JSON.stringify({
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        }),
        'retrieve',
        CORPUS_DEFAULT_ID,
      ],
    },
    {
      id: 'agent-tool-echo',
      type: 'AppTool',
      label: 'Tool: echo',
      position: { x: 40, y: 720 },
      width: 300,
      height: 300,
      inputs: [],
      outputs: [{ name: 'tools', dataType: 'TOOLS' }],
      widgetValues: [
        'echo_demo',
        'Returns JSON-encoded arguments (for demos / tests).',
        JSON.stringify({
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        }),
        'echo',
        CORPUS_DEFAULT_ID,
      ],
    },
    {
      id: 'agent-tools-join',
      type: 'AppToolsJoin',
      label: 'Join tools',
      position: { x: 400, y: 420 },
      width: 260,
      height: 140,
      inputs: [
        { name: 'a', dataType: 'TOOLS' },
        { name: 'b', dataType: 'TOOLS' },
      ],
      outputs: [{ name: 'out', dataType: 'TOOLS' }],
      widgetValues: [],
    },
    {
      id: 'agent-node',
      type: 'AppAgent',
      label: 'Agent',
      position: { x: 720, y: 160 },
      width: 340,
      height: 420,
      inputs: [
        { name: 'prompt', dataType: 'TEXT' },
        { name: 'tools', dataType: 'TOOLS' },
      ],
      outputs: [
        { name: 'answer', dataType: 'TEXT' },
        { name: 'trace', dataType: 'TEXT' },
      ],
      widgetValues: [
        6,
        'gpt-4o-mini',
        [
          'You can call tools. Prefer retrieve_passages to gather facts from the corpus, then answer concisely.',
          'If no tools are needed, answer directly.',
        ].join(' '),
      ],
    },
    {
      id: 'agent-output',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 1120, y: 220 },
      width: 300,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'agent-e-in',
      sourceNodeId: 'agent-input',
      sourcePortIndex: 0,
      targetNodeId: 'agent-node',
      targetPortIndex: 0,
    },
    {
      id: 'agent-e-tr',
      sourceNodeId: 'agent-tool-retrieve',
      sourcePortIndex: 0,
      targetNodeId: 'agent-tools-join',
      targetPortIndex: 0,
    },
    {
      id: 'agent-e-te',
      sourceNodeId: 'agent-tool-echo',
      sourcePortIndex: 0,
      targetNodeId: 'agent-tools-join',
      targetPortIndex: 1,
    },
    {
      id: 'agent-e-tj',
      sourceNodeId: 'agent-tools-join',
      sourcePortIndex: 0,
      targetNodeId: 'agent-node',
      targetPortIndex: 1,
    },
    {
      id: 'agent-e-out',
      sourceNodeId: 'agent-node',
      sourcePortIndex: 0,
      targetNodeId: 'agent-output',
      targetPortIndex: 0,
    },
  ],
}
