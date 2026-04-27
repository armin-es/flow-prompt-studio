import { apiFetch } from './apiFetch'
import { apiUrl } from './completeStream'
import type { TextChunk } from '../engine/retrieve/chunk'

export type EmbedResponse =
  | { vectors: number[][]; reason?: undefined }
  | { vectors: null; reason: string }

/**
 * OpenAI text embeddings via `POST /api/embed` (same CORS and proxy as `/api/complete`).
 */
export async function postEmbed(
  texts: string[],
  options: { signal: AbortSignal },
): Promise<EmbedResponse> {
  if (texts.length === 0) {
    return { vectors: [] }
  }
  const { signal } = options
  const r = await apiFetch(apiUrl('/api/embed'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal,
  })
  if (!r.ok) {
    let msg = r.statusText || 'embed request failed'
    try {
      const j = (await r.json()) as { error?: string }
      if (j.error) {
        msg = j.error
      }
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  const data = (await r.json()) as { vectors: number[][] | null; reason?: string }
  if (data.vectors == null) {
    return { vectors: null, reason: data.reason ?? 'unavailable' }
  }
  return { vectors: data.vectors }
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
}

function dot(a: number[], b: number[]): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    s += a[i]! * b[i]!
  }
  return s
}

/**
 * Ranks chunks by cosine similarity to the query; vectors must align with `chunks` order.
 */
export function rankChunksByCosine(
  q: number[],
  chunkVecs: number[][],
  chunks: TextChunk[],
): {
  source: string
  text: string
  score: number
  docTitle: string
  partIndex: number
}[] {
  const qn = norm(q)
  const rows: {
    source: string
    text: string
    score: number
    docTitle: string
    partIndex: number
  }[] = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunkVecs[i]!
    const cn = norm(c)
    const cos = dot(q, c) / (qn * cn)
    const ch = chunks[i]!
    rows.push({
      source: ch.source,
      text: ch.text,
      score: Number.isFinite(cos) ? cos : 0,
      docTitle: ch.docTitle,
      partIndex: ch.partIndex,
    })
  }
  return rows.sort((a, b) => b.score - a.score)
}
