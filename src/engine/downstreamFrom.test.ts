import { describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode } from '../types'
import { graphFingerprint } from '../lib/graphFingerprint'
import { nodesDownstreamFrom } from './downstreamFrom'
import { firstMissingUpstreamPort, portKey } from '../lib/portOutputRecord'

function N(
  id: string,
  type: string,
  inputs: { name: string; dataType: string }[] = [],
  outputs: { name: string; dataType: string }[] = [],
): GraphNode {
  return {
    id,
    type,
    label: type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    inputs,
    outputs,
    widgetValues: [],
  }
}

describe('nodesDownstreamFrom', () => {
  it('includes start and reachable targets', () => {
    const nodes = new Map<string, GraphNode>([
      ['a', N('a', 'AppInput', [], [{ name: 'o', dataType: 'TEXT' }])],
      ['b', N('b', 'AppLlm', [{ name: 'i', dataType: 'TEXT' }], [{ name: 'o', dataType: 'TEXT' }])],
    ])
    const edges = new Map<string, GraphEdge>([
      ['e1', { id: 'e1', sourceNodeId: 'a', sourcePortIndex: 0, targetNodeId: 'b', targetPortIndex: 0 }],
    ])
    const d = nodesDownstreamFrom('a', nodes, edges)
    expect(d.has('a')).toBe(true)
    expect(d.has('b')).toBe(true)
    expect(d.size).toBe(2)
  })

  it('from downstream does not include upstream-only nodes in a chain', () => {
    const o = [{ name: 'o', dataType: 'T' }]
    const i = [{ name: 'i', dataType: 'T' }]
    const nodes = new Map<string, GraphNode>([
      ['a', N('a', 'A', [], o)],
      ['b', N('b', 'B', i, o)],
      ['c', N('c', 'C', i, o)],
    ])
    const edges = new Map<string, GraphEdge>([
      ['e1', { id: 'e1', sourceNodeId: 'a', sourcePortIndex: 0, targetNodeId: 'b', targetPortIndex: 0 }],
      ['e2', { id: 'e2', sourceNodeId: 'b', sourcePortIndex: 0, targetNodeId: 'c', targetPortIndex: 0 }],
    ])
    const d = nodesDownstreamFrom('b', nodes, edges)
    expect(d.has('a')).toBe(false)
    expect(d.has('b')).toBe(true)
    expect(d.has('c')).toBe(true)
  })
})

describe('graphFingerprint', () => {
  it('changes when widget values change', () => {
    const a = N('1', 'AppInput', [], [])
    a.widgetValues = ['hi']
    const b = { ...a, widgetValues: ['there'] } as GraphNode
    const n1 = new Map([['1', a]])
    const n2 = new Map([['1', b]])
    const e = new Map<string, GraphEdge>()
    expect(graphFingerprint(n1, e)).not.toBe(graphFingerprint(n2, e))
  })
})

describe('firstMissingUpstreamPort', () => {
  it('returns null when all outside edges are cached', () => {
    const downstream = new Set(['b', 'c'])
    const edges = new Map<string, GraphEdge>([
      ['e1', { id: 'e1', sourceNodeId: 'a', sourcePortIndex: 0, targetNodeId: 'b', targetPortIndex: 0 }],
    ])
    const k = portKey('a', 0)
    const portOutputs: Record<string, { type: string }> = {
      [k]: { type: 'TEXT' },
    }
    expect(
      firstMissingUpstreamPort(
        downstream,
        edges,
        portOutputs,
      ),
    ).toBeNull()
  })
})
