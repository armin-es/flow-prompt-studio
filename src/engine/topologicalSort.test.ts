import { describe, it, expect } from 'vitest'
import type { GraphNode, GraphEdge, NodeId } from '../types'
import { topologicalSort } from './topologicalSort'

function node(id: string, label = 'n'): GraphNode {
  return {
    id,
    type: 'X',
    label,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    inputs: [],
    outputs: [],
    widgetValues: [],
  }
}

function edge(
  id: string,
  from: [string, number],
  to: [string, number],
): GraphEdge {
  return {
    id,
    sourceNodeId: from[0],
    sourcePortIndex: from[1],
    targetNodeId: to[0],
    targetPortIndex: to[1],
  }
}

describe('topologicalSort', () => {
  it('orders a 3-node chain a → b → c as [a, b, c]', () => {
    const nodes = new Map<NodeId, GraphNode>([
      ['a', node('a')],
      ['b', node('b')],
      ['c', node('c')],
    ])
    const edges = new Map<string, GraphEdge>([
      ['1', edge('1', ['a', 0], ['b', 0])],
      ['2', edge('2', ['b', 0], ['c', 0])],
    ])
    const order = topologicalSort(nodes, edges)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('returns a shorter list when a cycle exists', () => {
    const nodes = new Map<NodeId, GraphNode>([
      ['a', node('a')],
      ['b', node('b')],
    ])
    const edges = new Map<string, GraphEdge>([
      ['1', edge('1', ['a', 0], ['b', 0])],
      ['2', edge('2', ['b', 0], ['a', 0])],
    ])
    const order = topologicalSort(nodes, edges)
    expect(order.length).toBeLessThan(nodes.size)
  })
})
