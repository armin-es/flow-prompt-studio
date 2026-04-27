import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  clearEmbedCacheMemory,
  embeddingCacheId,
  getEmbeddingsCached,
  sha256Hex,
} from './embedCache'

describe('embedCache', () => {
  beforeEach(() => {
    clearEmbedCacheMemory()
  })

  it('sha256Hex is stable for a known input', async () => {
    const h = await sha256Hex('test')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256Hex('test')).toBe(h)
  })

  it('embeddingCacheId differs when model or text differs', async () => {
    const a = await embeddingCacheId('m1', 'hello')
    const b = await embeddingCacheId('m2', 'hello')
    const c = await embeddingCacheId('m1', 'helloo')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('getEmbeddingsCached miss then hit: only one postEmbed batch for same texts', async () => {
    const postEmbed = vi.fn(async (texts: string[]) => ({
      vectors: texts.map((_, i) => new Array(4).fill(i)),
    }))
    const signal = new AbortController().signal

    const r1 = await getEmbeddingsCached(['a', 'b'], postEmbed, signal)
    expect(postEmbed).toHaveBeenCalledTimes(1)
    expect(r1.vectors).toHaveLength(2)

    const r2 = await getEmbeddingsCached(['a', 'b'], postEmbed, signal)
    expect(postEmbed).toHaveBeenCalledTimes(1)
    expect(r2.vectors).toEqual(r1.vectors)
  })

  it('getEmbeddingsCached fetches only uncached texts', async () => {
    const postEmbed = vi.fn(async (texts: string[]) => ({
      vectors: texts.map((t) => t.split('').map((c) => c.charCodeAt(0))),
    }))
    const signal = new AbortController().signal

    await getEmbeddingsCached(['only'], postEmbed, signal)
    expect(postEmbed).toHaveBeenCalledWith(['only'], { signal })
    postEmbed.mockClear()

    await getEmbeddingsCached(['only', 'xy'], postEmbed, signal)
    expect(postEmbed).toHaveBeenCalledTimes(1)
    expect(postEmbed).toHaveBeenCalledWith(['xy'], { signal })
  })
})
