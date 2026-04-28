import { describe, expect, it } from 'vitest'
import { chunkKey, mrrFirstGold, recallAtK } from './metrics'
import type { TextChunk } from '../engine/retrieve/chunk'

function fakeChunk(docId: string, partIndex: number): TextChunk {
  return {
    text: '',
    source: '',
    docTitle: '',
    partIndex,
    docId,
    firstParagraphIndex: 1,
    lastParagraphIndex: 1,
  }
}

describe('chunkKey', () => {
  it('formats docId and partIndex', () => {
    expect(chunkKey(fakeChunk('doc-2', 3))).toBe('doc-2#3')
  })
})

describe('recallAtK', () => {
  it('returns 1 for empty gold', () => {
    expect(recallAtK([], ['a', 'b'], 3)).toBe(1)
  })

  it('scores intersection over gold count', () => {
    const pred = ['doc-1#1', 'doc-2#1', 'doc-3#1']
    expect(recallAtK(['doc-1#1', 'doc-3#1'], pred, 2)).toBe(0.5)
    expect(recallAtK(['doc-1#1', 'doc-3#1'], pred, 3)).toBe(1)
  })
})

describe('mrrFirstGold', () => {
  it('returns reciprocal rank of first hit', () => {
    expect(mrrFirstGold(['x'], ['a', 'x', 'c'],)).toBe(0.5)
    expect(mrrFirstGold(['x'], ['x'],)).toBe(1)
    expect(mrrFirstGold(['x'], ['a', 'b'],)).toBe(0)
  })
})
