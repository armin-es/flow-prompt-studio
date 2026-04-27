import type { TextChunk } from './chunk'

const K1 = 1.2
const B = 0.75

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/\W+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

type Doc = { id: number; terms: string[]; len: number }

/**
 * Okapi BM25 over pre-chunked “documents” (search hits). Deterministic, no API.
 */
export function rankByBm25(
  query: string,
  chunks: TextChunk[],
): {
  source: string
  text: string
  score: number
  docTitle: string
  partIndex: number
}[] {
  if (chunks.length === 0) {
    return []
  }
  const qterms = new Set(tokenize(query))
  if (qterms.size === 0) {
    return chunks.map((c) => ({
      source: c.source,
      text: c.text,
      score: 0,
      docTitle: c.docTitle,
      partIndex: c.partIndex,
    }))
  }

  const docs: Doc[] = chunks.map((c, i) => {
    const terms = tokenize(c.text)
    return { id: i, terms, len: Math.max(1, terms.length) }
  })
  const N = docs.length
  const df = new Map<string, number>()
  for (const t of qterms) {
    let c = 0
    for (const d of docs) {
      if (d.terms.includes(t)) {
        c += 1
      }
    }
    df.set(t, c)
  }
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / N

  const scores: {
    source: string
    text: string
    score: number
    docTitle: string
    partIndex: number
  }[] = []
  for (const d of docs) {
    const termFreq = new Map<string, number>()
    for (const w of d.terms) {
      termFreq.set(w, (termFreq.get(w) ?? 0) + 1)
    }
    let s = 0
    for (const t of qterms) {
      const f = termFreq.get(t) ?? 0
      if (f === 0) {
        continue
      }
      const nti = df.get(t) ?? 0
      const idf = Math.log((N - nti + 0.5) / (nti + 0.5) + 1)
      const denom = f + K1 * (1 - B + (B * d.len) / avgdl)
      s += idf * (f * (K1 + 1)) / denom
    }
    const ch = chunks[d.id]!
    scores.push({
      source: ch.source,
      text: ch.text,
      score: s,
      docTitle: ch.docTitle,
      partIndex: ch.partIndex,
    })
  }
  return scores.sort((a, b) => b.score - a.score)
}
