import { postEmbed, rankChunksByCosine } from '../../lib/embedClient'
import { getEmbeddingsCached } from '../../lib/embedCache'
import { rankByBm25 } from './bm25'
import type { TextChunk } from './chunk'

const EMBED_BATCH = 32

/**
 * Ranks `chunks` against `query`. **cosine** uses `/api/embed` when a key is configured;
 * otherwise falls back to BM25 and a short `fallback` reason for the UI / output prefix.
 */
export async function rankChunksForQuery(
  query: string,
  chunks: TextChunk[],
  mode: 'bm25' | 'cosine',
  signal: AbortSignal,
): Promise<{
  rows: {
    source: string
    text: string
    score: number
    docTitle: string
    partIndex: number
  }[]
  fallbackNote: string | null
}> {
  if (chunks.length === 0) {
    return { rows: [], fallbackNote: null }
  }
  if (mode === 'bm25') {
    return { rows: rankByBm25(query, chunks), fallbackNote: null }
  }
  const qRes = await getEmbeddingsCached([query], postEmbed, signal)
  if (qRes.vectors == null || qRes.vectors.length < 1) {
    return {
      rows: rankByBm25(query, chunks),
      fallbackNote: 'Cosine: embeddings unavailable (no API key or error); used BM25 instead.',
    }
  }
  const qv = qRes.vectors[0]!
  const allTexts = chunks.map((c) => c.text)
  const vecs: number[][] = []
  for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
    const batch = allTexts.slice(i, i + EMBED_BATCH)
    const res = await getEmbeddingsCached(batch, postEmbed, signal)
    if (res.vectors == null || res.vectors.length !== batch.length) {
      return {
        rows: rankByBm25(query, chunks),
        fallbackNote: 'Cosine: embedding batch failed; used BM25 instead.',
      }
    }
    vecs.push(...res.vectors)
  }
  if (vecs.length !== chunks.length) {
    return {
      rows: rankByBm25(query, chunks),
      fallbackNote: 'Cosine: embedding count mismatch; used BM25 instead.',
    }
  }
  return {
    rows: rankChunksByCosine(qv, vecs, chunks),
    fallbackNote: null,
  }
}
