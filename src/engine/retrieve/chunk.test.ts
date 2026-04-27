import { describe, expect, it } from 'vitest'
import { chunkCorpus, formatCitationLabel } from './chunk'

describe('chunkCorpus', () => {
  it('splits on document delimiter and chunks long documents', () => {
    const corpus = `First doc body ${'x'.repeat(200)}

---

Second only`
    const out = chunkCorpus(corpus, { chunkSize: 80, chunkOverlap: 10 })
    expect(out.length).toBeGreaterThan(1)
    const sources = new Set(out.map((c) => c.source))
    expect(sources.size).toBeGreaterThan(0)
  })

  it('sets docTitle from first line and formats citation labels', () => {
    const corpus = `# Test heading

Body only here.`
    const out = chunkCorpus(corpus, { chunkSize: 200, chunkOverlap: 10 })
    expect(out[0]!.docTitle).toBe('Test heading')
    expect(out[0]!.partIndex).toBe(1)
    expect(formatCitationLabel(out[0]!)).toBe('[Test heading (¶1)]')
  })

  it('uses sliding windows with expected step', () => {
    const c = 'a'.repeat(100)
    const parts = chunkCorpus(c, { chunkSize: 30, chunkOverlap: 5 })
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) {
      expect(p.text.length).toBeLessThanOrEqual(30)
    }
  })

  it('merges full paragraphs and does not cut between two short paragraphs', () => {
    const corpus = 'First line.\n\nSecond line, still short.'
    const out = chunkCorpus(corpus, { chunkSize: 200, chunkOverlap: 0 })
    expect(out).toHaveLength(1)
    expect(out[0]!.text).toContain('First line')
    expect(out[0]!.text).toContain('Second line')
    expect(out[0]!.lastParagraphIndex).toBe(2)
    expect(out[0]!.docId).toBe('doc-1')
  })

  it('assigns doc-1 and doc-2 across --- documents', () => {
    const corpus = 'One.\n\n---\n\nTwo.'
    const out = chunkCorpus(corpus, { chunkSize: 100, chunkOverlap: 0 })
    const ids = [...new Set(out.map((c) => c.docId))]
    expect(ids).toEqual(['doc-1', 'doc-2'])
  })
})
