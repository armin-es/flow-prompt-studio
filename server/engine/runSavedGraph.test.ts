import { describe, expect, it } from 'vitest'
import type { SerializedGraphJson } from '../db/schema.js'
import type { SpamDb } from '../spam/spamBaselineRules.js'
import { runSavedGraph, getPrimaryAppLlmText } from './runSavedGraph.js'

const stubDb = {} as SpamDb

function inputNode(
  id: string,
  widget: string,
): [string, Record<string, unknown>] {
  return [
    id,
    {
      id,
      type: 'AppInput',
      label: id,
      position: { x: 0, y: 0 },
      width: 1,
      height: 1,
      inputs: [],
      outputs: [{ name: 'o', dataType: 'TEXT' }],
      widgetValues: [widget],
    },
  ]
}

function joinNode(
  id: string,
  sep: string,
): [string, Record<string, unknown>] {
  return [
    id,
    {
      id,
      type: 'AppJoin',
      label: id,
      position: { x: 0, y: 0 },
      width: 1,
      height: 1,
      inputs: [
        { name: 'a', dataType: 'TEXT' },
        { name: 'b', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'o', dataType: 'TEXT' }],
      widgetValues: [sep],
    },
  ]
}

describe('runSavedGraph', () => {
  it('runs AppInput → AppJoin in topo order', async () => {
    const data: SerializedGraphJson = {
      version: 1,
      nodes: [inputNode('a', 'hello'), inputNode('b', 'world'), joinNode('j', '|')],
      edges: [
        [
          'e1',
          {
            id: 'e1',
            sourceNodeId: 'a',
            sourcePortIndex: 0,
            targetNodeId: 'j',
            targetPortIndex: 0,
          },
        ],
        [
          'e2',
          {
            id: 'e2',
            sourceNodeId: 'b',
            sourcePortIndex: 0,
            targetNodeId: 'j',
            targetPortIndex: 1,
          },
        ],
      ],
      selection: [],
      edgeSelection: [],
    }
    const r = await runSavedGraph(stubDb, 'u1', data, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.outputs.get('j:0')?.text).toBe('hello|world')
  })

  it('returns error for unsupported node types', async () => {
    const data: SerializedGraphJson = {
      version: 1,
      nodes: [
        inputNode('a', 'x'),
        [
          'bad',
          {
            id: 'bad',
            type: 'AppAgent',
            label: 'bad',
            position: { x: 0, y: 0 },
            width: 1,
            height: 1,
            inputs: [{ name: 'i', dataType: 'TEXT' }],
            outputs: [{ name: 'o', dataType: 'TEXT' }],
            widgetValues: [],
          },
        ],
      ],
      edges: [
        [
          'e1',
          {
            id: 'e1',
            sourceNodeId: 'a',
            sourcePortIndex: 0,
            targetNodeId: 'bad',
            targetPortIndex: 0,
          },
        ],
      ],
      selection: [],
      edgeSelection: [],
    }
    const r = await runSavedGraph(stubDb, 'u1', data, {})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Unsupported node type/)
  })
})

describe('getPrimaryAppLlmText', () => {
  it('prefers spam-llm:0 when present', () => {
    const data: SerializedGraphJson = { version: 1, nodes: [], edges: [], selection: [], edgeSelection: [] }
    const order = ['spam-llm', 'other']
    const outputs = new Map([
      ['spam-llm:0', { type: 'TEXT' as const, text: '{"verdict":"ham"}' }],
      ['other:0', { type: 'TEXT' as const, text: 'ignore' }],
    ])
    expect(getPrimaryAppLlmText(data, order, outputs)).toBe('{"verdict":"ham"}')
  })
})
