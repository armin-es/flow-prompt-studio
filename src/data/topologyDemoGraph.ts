import type { AppGraphState } from './defaultAppGraph'

/**
 * Diamond: one input → **Tee** (two outputs) → two **Prefix** branches → **Join** → **Output**.
 * Showcases fan-out and fan-in without calling the LLM.
 */
export const TOPOLOGY_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'topo-in-1',
      type: 'AppInput',
      label: 'Input',
      position: { x: 40, y: 100 },
      width: 280,
      height: 160,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [
        'One source text split into two branches, then merged again.',
      ],
    },
    {
      id: 'topo-tee-1',
      type: 'AppTee',
      label: 'Tee',
      position: { x: 380, y: 90 },
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
      id: 'topo-pre-a',
      type: 'AppPrefix',
      label: 'Prefix A',
      position: { x: 660, y: 20 },
      width: 260,
      height: 130,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['[A] '],
    },
    {
      id: 'topo-pre-b',
      type: 'AppPrefix',
      label: 'Prefix B',
      position: { x: 660, y: 190 },
      width: 260,
      height: 130,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['[B] '],
    },
    {
      id: 'topo-join-1',
      type: 'AppJoin',
      label: 'Join',
      position: { x: 980, y: 100 },
      width: 280,
      height: 150,
      inputs: [
        { name: 'a', dataType: 'TEXT' },
        { name: 'b', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['\n---\n'],
    },
    {
      id: 'topo-out-1',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 1320, y: 110 },
      width: 300,
      height: 130,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'topo-e1',
      sourceNodeId: 'topo-in-1',
      sourcePortIndex: 0,
      targetNodeId: 'topo-tee-1',
      targetPortIndex: 0,
    },
    {
      id: 'topo-e2',
      sourceNodeId: 'topo-tee-1',
      sourcePortIndex: 0,
      targetNodeId: 'topo-pre-a',
      targetPortIndex: 0,
    },
    {
      id: 'topo-e3',
      sourceNodeId: 'topo-tee-1',
      sourcePortIndex: 1,
      targetNodeId: 'topo-pre-b',
      targetPortIndex: 0,
    },
    {
      id: 'topo-e4',
      sourceNodeId: 'topo-pre-a',
      sourcePortIndex: 0,
      targetNodeId: 'topo-join-1',
      targetPortIndex: 0,
    },
    {
      id: 'topo-e5',
      sourceNodeId: 'topo-pre-b',
      sourcePortIndex: 0,
      targetNodeId: 'topo-join-1',
      targetPortIndex: 1,
    },
    {
      id: 'topo-e6',
      sourceNodeId: 'topo-join-1',
      sourcePortIndex: 0,
      targetNodeId: 'topo-out-1',
      targetPortIndex: 0,
    },
  ],
}
