import { beforeAll, describe, expect, it } from 'vitest'
import type { GraphEdge, GraphNode, NodeId } from '../types'
import {
  buildNodeStampsForGraph,
  nodeContentStamp,
  whyPartialRunInvalid,
} from './partialRunValidation'
import { useCorpusStore, __clearCorpusStoreForTests } from '../store/corpusStore'

function node(
  id: string,
  type: string,
  widgetValues: unknown[] = [],
): [NodeId, GraphNode] {
  return [
    id,
    {
      id,
      type,
      label: id,
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      inputs: [],
      outputs: [],
      widgetValues,
    },
  ]
}

function edge(id: string, a: string, b: string): [string, GraphEdge] {
  return [
    id,
    { id, sourceNodeId: a, sourcePortIndex: 0, targetNodeId: b, targetPortIndex: 0 },
  ]
}

beforeAll(async () => {
  __clearCorpusStoreForTests()
  await useCorpusStore.getState().init()
})

describe('nodeContentStamp', () => {
  it('changes when only widget values change (same type)', () => {
    const [, a] = node('1', 'AppLlm', ['A'])
    const [, b] = node('1', 'AppLlm', ['B'])
    expect(nodeContentStamp(a)).not.toBe(nodeContentStamp(b))
  })

  it('for AppRetrieve changes when the named corpus body changes (same id)', () => {
    const cid = 'corpus-partial-test'
    useCorpusStore.getState().upsert(cid, 'n', 'alpha')
    const [, r] = node('1', 'AppRetrieve', [3, cid, 800, 100, 'bm25'])
    const a = nodeContentStamp(r)
    useCorpusStore.getState().upsert(cid, 'n', 'beta')
    const b = nodeContentStamp(r)
    expect(a).not.toBe(b)
  })
})

describe('whyPartialRunInvalid', () => {
  it('allows “from here” on LLM when only LLM was edited; Input stamp still matches', () => {
    const n = new Map<NodeId, GraphNode>([node('in', 'AppInput', ['i']), node('llm', 'AppLlm', ['v2'])])
    const e = new Map<string, GraphEdge>([edge('e1', 'in', 'llm')])
    const portOutputs: Record<string, { type: 'TEXT'; text: string }> = {
      'in:0': { type: 'TEXT', text: 'hello' },
    }
    // Cache from when LLM had v1; user then changed the LLM widget to v2 (no full re-run)
    const cachedStamps: Record<string, string> = {
      in: nodeContentStamp(n.get('in')!),
      llm: nodeContentStamp({ ...n.get('llm')!, widgetValues: ['v1'] } as GraphNode),
    }
    const r = whyPartialRunInvalid('llm', n, e, portOutputs, cachedStamps)
    expect(r).toBeNull()
  })

  it('rejects when an upstream node was edited after cache (stamp mismatch)', () => {
    const n = new Map<NodeId, GraphNode>([node('in', 'AppInput', ['B']), node('out', 'AppOutput', [])])
    const e = new Map<string, GraphEdge>([edge('e1', 'in', 'out')])
    const portOutputs: Record<string, { type: 'TEXT'; text: string }> = {
      'in:0': { type: 'TEXT', text: 'x' },
    }
    const cachedStamps: Record<string, string> = {
      in: nodeContentStamp({ ...n.get('in')!, widgetValues: ['A'] } as GraphNode),
    }
    const r = whyPartialRunInvalid('out', n, e, portOutputs, cachedStamps)
    expect(r).not.toBeNull()
  })
})

describe('buildNodeStampsForGraph', () => {
  it('builds a stamp for every node', () => {
    const m = new Map<NodeId, GraphNode>([node('a', 'T', [1])])
    const s = buildNodeStampsForGraph(m)
    expect(s.a).toBe(nodeContentStamp(m.get('a')!))
  })

  it('uses a random suffix for AppAgent so cache !== volatile fingerprint', () => {
    const [, ag] = node('ag', 'AppAgent', [6, 'gpt-4o-mini', 'sys'])
    const m = new Map<NodeId, GraphNode>([['ag', ag]])
    const want = nodeContentStamp(ag)
    const s = buildNodeStampsForGraph(m)
    expect(want).toContain('__volatile__')
    expect(s.ag).not.toBe(want)
    expect(s.ag.startsWith('AppAgent\0')).toBe(true)
  })
})
