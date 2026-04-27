import { describe, expect, it } from 'vitest'
import {
  appendIngestedToCorpus,
  filterIngestFiles,
  formatIngestedBlock,
} from './corpusFileIngest'
import type { IngestedDocument } from './corpusFileIngest'

function doc(over: Partial<IngestedDocument> = {}): IngestedDocument {
  return {
    id: 'x',
    title: 'a.md',
    body: 'hello',
    addedAt: 1,
    sha256: 'abc',
    ...over,
  }
}

describe('appendIngestedToCorpus', () => {
  it('appends with --- when corpus already has text', () => {
    const { body, error } = appendIngestedToCorpus('existing', [doc()], 10_000)
    expect(error).toBeUndefined()
    expect(body).toContain('existing')
    expect(body).toContain('---')
    expect(body).toContain('# a.md')
    expect(body).toContain('hello')
  })

  it('rejects when over max bytes', () => {
    const { body, error } = appendIngestedToCorpus('x', [doc({ body: 'y' })], 3)
    expect(error).toBeDefined()
    expect(body).toBe('x')
  })
})

describe('formatIngestedBlock', () => {
  it('uses filename as heading', () => {
    expect(formatIngestedBlock(doc({ title: 'n.md', body: 'c' }))).toBe('# n.md\n\nc')
  })
})

describe('filterIngestFiles', () => {
  it('keeps only md, txt, json', () => {
    const a = new File(['a'], 'a.md', { type: 'text/plain' })
    const b = new File(['b'], 'b.pdf', { type: 'application/pdf' })
    const c = new File(['c'], 'c.txt', { type: 'text/plain' })
    expect(filterIngestFiles([a, b, c]).map((f) => f.name)).toEqual(['a.md', 'c.txt'])
  })
})
