import { formatCitationLabel } from './chunk.js'

/** Row shape from spam cosine retrieve (server or client API). */
export type RetrieveFormatRow = {
  text: string
  source: string
  score: number
  docTitle?: string
  partIndex?: number
}

/** TEXT output compatible with client {@link NodeOutput} without importing React stores. */
export type RetrieveFormattedPortOutput = {
  type: 'TEXT'
  text: string
  retrieveHits?: Array<{
    citationIndex: number
    label: string
    source: string
    score: number
  }>
}

/**
 * Format numbered passages for downstream Join / LLM (matches {@link AppRetrieve} cosine layout).
 */
export function formatRetrieveOutput(
  rows: RetrieveFormatRow[],
): Record<number, RetrieveFormattedPortOutput> {
  const citationInstructions =
    "Cite the passages you use as [1], [2], … (numbers match Passage [n] below). " +
    "If the Context does not contain enough information to answer, reply exactly: I don't know."
  const body = rows
    .map((r, i) => {
      const n = i + 1
      const label = formatCitationLabel({
        docTitle: r.docTitle ?? r.source,
        partIndex: r.partIndex ?? 1,
      })
      return `Passage [${n}] — ${label} (score ${r.score.toFixed(4)})\n${r.text}`
    })
    .join('\n\n---\n\n')
  const head = rows.length === 0 ? '[retrieval: no passages matched]\n\n' : ''
  const text = head + citationInstructions + '\n\n---\n\n' + (body || '(empty)')
  return {
    0: {
      type: 'TEXT',
      text,
      retrieveHits: rows.map((r, i) => ({
        citationIndex: i + 1,
        label: formatCitationLabel({
          docTitle: r.docTitle ?? r.source,
          partIndex: r.partIndex ?? 1,
        }),
        source: r.source,
        score: r.score,
      })),
    },
  }
}
