import type { TextChunk } from '../engine/retrieve/chunk'

/** Stable key for a passage (matches chunking of `chunkCorpus`). */
export function chunkKey(c: Pick<TextChunk, 'docId' | 'partIndex'>): string {
  return `${c.docId}#${c.partIndex}`
}

/**
 * Retrieval recall: fraction of gold keys that appear in the top-`k` ranked keys (order preserved).
 * Empty gold → returns 1 (vacuous success).
 */
export function recallAtK(
  goldChunkKeys: readonly string[],
  predictedOrderedKeys: readonly string[],
  k: number,
): number {
  if (goldChunkKeys.length === 0) {
    return 1
  }
  const top = new Set(predictedOrderedKeys.slice(0, k))
  let hits = 0
  for (const g of goldChunkKeys) {
    if (top.has(g)) {
      hits += 1
    }
  }
  return hits / goldChunkKeys.length
}

/** Mean reciprocal rank of the first gold hit (first relevant in ranked list). */
export function mrrFirstGold(
  goldChunkKeys: readonly string[],
  predictedOrderedKeys: readonly string[],
): number {
  if (goldChunkKeys.length === 0) {
    return 1
  }
  const want = new Set(goldChunkKeys)
  for (let i = 0; i < predictedOrderedKeys.length; i++) {
    if (want.has(predictedOrderedKeys[i]!)) {
      return 1 / (i + 1)
    }
  }
  return 0
}

/** Map a ranked row back to a chunk key by matching title + part (unique per corpus build). */
export function rowToChunkKey(
  row: { docTitle: string; partIndex: number },
  chunks: TextChunk[],
): string | null {
  const ch = chunks.find(
    (c) => c.docTitle === row.docTitle && c.partIndex === row.partIndex,
  )
  return ch != null ? chunkKey(ch) : null
}
