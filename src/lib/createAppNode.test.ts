import { describe, expect, it } from 'vitest'
import { createAppNode } from './createAppNode'

describe('createAppNode', () => {
  it('AppTee has two TEXT outputs and one input', () => {
    const n = createAppNode('AppTee', { x: 1, y: 2 })
    expect(n.inputs).toHaveLength(1)
    expect(n.outputs).toHaveLength(2)
    expect(n.id.startsWith('new-AppTee-')).toBe(true)
  })

  it('AppJoin has two inputs and one output', () => {
    const n = createAppNode('AppJoin', { x: 0, y: 0 })
    expect(n.inputs).toHaveLength(2)
    expect(n.outputs).toHaveLength(1)
  })

  it('AppRetrieve has query in and snippets out, with default widgets', () => {
    const n = createAppNode('AppRetrieve', { x: 0, y: 0 })
    expect(n.type).toBe('AppRetrieve')
    expect(n.inputs).toEqual([{ name: 'query', dataType: 'TEXT' }])
    expect(n.outputs).toEqual([{ name: 'snippets', dataType: 'TEXT' }])
    expect(n.widgetValues[0]).toBe(3)
    expect(n.widgetValues[1]).toBe('corpus-default')
    expect(n.widgetValues[2]).toBe(800)
    expect(n.widgetValues[4]).toBe('bm25')
  })
})
