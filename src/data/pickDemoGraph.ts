import type { AppGraphState } from './defaultAppGraph'

/**
 * Two **AppInput** nodes → **AppPick** (chooses one wire) → **AppOutput**.
 * Complements the tee/join graph: here fan-in is *selective*, not concat.
 */
export const PICK_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'pick-in-a',
      type: 'AppInput',
      label: 'Option A',
      position: { x: 40, y: 80 },
      width: 280,
      height: 120,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['This is branch A.'],
    },
    {
      id: 'pick-in-b',
      type: 'AppInput',
      label: 'Option B',
      position: { x: 40, y: 260 },
      width: 280,
      height: 120,
      inputs: [],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['This is branch B.'],
    },
    {
      id: 'pick-1',
      type: 'AppPick',
      label: 'Pick',
      position: { x: 400, y: 150 },
      width: 240,
      height: 120,
      inputs: [
        { name: '0', dataType: 'TEXT' },
        { name: '1', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: ['0'],
    },
    {
      id: 'pick-out-1',
      type: 'AppOutput',
      label: 'Output',
      position: { x: 700, y: 160 },
      width: 280,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'pick-e1',
      sourceNodeId: 'pick-in-a',
      sourcePortIndex: 0,
      targetNodeId: 'pick-1',
      targetPortIndex: 0,
    },
    {
      id: 'pick-e2',
      sourceNodeId: 'pick-in-b',
      sourcePortIndex: 0,
      targetNodeId: 'pick-1',
      targetPortIndex: 1,
    },
    {
      id: 'pick-e3',
      sourceNodeId: 'pick-1',
      sourcePortIndex: 0,
      targetNodeId: 'pick-out-1',
      targetPortIndex: 0,
    },
  ],
}
