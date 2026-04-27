import { describe, expect, it } from 'vitest'
import { rankByBm25 } from './bm25'

describe('rankByBm25', () => {
  it('ranks the only chunk containing a rare query term first', () => {
    const chunks = [
      {
        text: 'alpha beta gamma',
        source: 'a',
        docTitle: 'a',
        partIndex: 1,
        docId: 'doc-1',
        firstParagraphIndex: 1,
        lastParagraphIndex: 1,
      },
      {
        text: 'delta quuxfoxtrot echo',
        source: 'b',
        docTitle: 'b',
        partIndex: 1,
        docId: 'doc-1',
        firstParagraphIndex: 1,
        lastParagraphIndex: 1,
      },
    ]
    const r = rankByBm25('quuxfoxtrot', chunks)
    expect(r[0]!.source).toBe('b')
  })

  it('returns all chunks with zero score when query has no terms', () => {
    const chunks = [
      {
        text: 'hello',
        source: 'x',
        docTitle: 'x',
        partIndex: 1,
        docId: 'doc-1',
        firstParagraphIndex: 1,
        lastParagraphIndex: 1,
      },
    ]
    const r = rankByBm25('   ', chunks)
    expect(r).toHaveLength(1)
    expect(r[0]!.score).toBe(0)
  })
})
