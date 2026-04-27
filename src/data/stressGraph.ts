import type { AppGraphState } from './defaultAppGraph'
import type { GraphNode } from '../types'

/**
 * Long chain of lightweight `Stress` nodes for render / pan / zoom profiling.
 */
export function buildStressGraph(count: number): AppGraphState {
  const c = Math.max(1, Math.min(500, count))
  const cols = Math.max(1, Math.ceil(Math.sqrt(c)))
  const nodes: GraphNode[] = []
  const edges: AppGraphState['edges'] = []

  for (let i = 0; i < c; i += 1) {
    const row = Math.floor(i / cols)
    const col = i % cols
    nodes.push({
      id: `str-${i}`,
      type: 'Stress',
      label: 'Stress',
      position: { x: 40 + col * 200, y: 40 + row * 100 },
      width: 120,
      height: 64,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [{ name: 'out', dataType: 'TEXT' }],
      widgetValues: [],
    })
    if (i > 0) {
      edges.push({
        id: `e${i - 1}-${i}`,
        sourceNodeId: `str-${i - 1}`,
        sourcePortIndex: 0,
        targetNodeId: `str-${i}`,
        targetPortIndex: 0,
      })
    }
  }
  return { nodes, edges }
}
