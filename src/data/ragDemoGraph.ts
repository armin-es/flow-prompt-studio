import type { AppGraphState } from './defaultAppGraph'
import { CORPUS_DEFAULT_ID } from '../store/corpusStore'

/**
 * **Question** → **Tee** (fan-out) → **Retrieve** (query) + **Join** (a=question, b=snippets) → **LLM** → **Output**.
 * Default question aims at the BM25 passage in the **Default** named corpus (`corpus-default`).
 */
export const RAG_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'rag-input',
      type: 'AppInput',
      label: 'Question',
      position: { x: 40, y: 80 },
      width: 300,
      height: 160,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['What is BM25?'],
    },
    {
      id: 'rag-tee',
      type: 'AppTee',
      label: 'Tee',
      position: { x: 400, y: 100 },
      width: 220,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [
        { name: 'out A', dataType: 'TEXT' },
        { name: 'out B', dataType: 'TEXT' },
      ],
      widgetValues: [],
    },
    {
      id: 'rag-ret',
      type: 'AppRetrieve',
      label: 'Retrieve',
      position: { x: 400, y: 280 },
      width: 320,
      height: 400,
      inputs: [{ name: 'query', dataType: 'TEXT' }],
      outputs: [{ name: 'snippets', dataType: 'TEXT' }],
      widgetValues: [3, CORPUS_DEFAULT_ID, 800, 100, 'bm25'],
    },
    {
      id: 'rag-join',
      type: 'AppJoin',
      label: 'Join',
      position: { x: 800, y: 160 },
      width: 300,
      height: 150,
      inputs: [
        { name: 'a (question)', dataType: 'TEXT' },
        { name: 'b (retrieved)', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        '\n\n--- Context (numbered passages; cite as [1], [2], … in your answer) ---\n\n',
      ],
    },
    {
      id: 'rag-llm',
      type: 'AppLlm',
      label: 'LLM',
      position: { x: 1160, y: 140 },
      width: 300,
      height: 200,
      inputs: [{ name: 'prompt', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        [
          'You receive the user question and a Context block with numbered passages Passage [1], Passage [2], …',
          'Answer in one or two short sentences. When you use a fact from Context, cite it with the matching bracket number, e.g. [1].',
          "If Context does not support an answer, reply exactly: I don't know.",
          'No markdown unless asked.',
        ].join(' '),
      ],
    },
    {
      id: 'rag-out',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 1520, y: 170 },
      width: 300,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'rag-e0',
      sourceNodeId: 'rag-input',
      sourcePortIndex: 0,
      targetNodeId: 'rag-tee',
      targetPortIndex: 0,
    },
    {
      id: 'rag-e1',
      sourceNodeId: 'rag-tee',
      sourcePortIndex: 0,
      targetNodeId: 'rag-ret',
      targetPortIndex: 0,
    },
    {
      id: 'rag-e2',
      sourceNodeId: 'rag-tee',
      sourcePortIndex: 1,
      targetNodeId: 'rag-join',
      targetPortIndex: 0,
    },
    {
      id: 'rag-e3',
      sourceNodeId: 'rag-ret',
      sourcePortIndex: 0,
      targetNodeId: 'rag-join',
      targetPortIndex: 1,
    },
    {
      id: 'rag-e4',
      sourceNodeId: 'rag-join',
      sourcePortIndex: 0,
      targetNodeId: 'rag-llm',
      targetPortIndex: 0,
    },
    {
      id: 'rag-e5',
      sourceNodeId: 'rag-llm',
      sourcePortIndex: 0,
      targetNodeId: 'rag-out',
      targetPortIndex: 0,
    },
  ],
}
