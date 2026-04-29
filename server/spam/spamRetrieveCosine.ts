import OpenAI from 'openai'
import type pg from 'pg'
import { embedPendingChunksForCorpus } from '../embedCorpusChunks.js'
import type { SpamDb } from './spamBaselineRules.js'
import { vectorToPgLiteral } from './pgVector.js'

export type RetrieveHit = {
  text: string
  source: string
  docTitle: string
  score: number
}

/**
 * Cosine retrieval over embedded chunks for one corpus (same SQL as POST /api/retrieve).
 */
export async function retrieveCosineChunks(
  db: SpamDb,
  pool: pg.Pool,
  userId: string,
  corpusId: string,
  query: string,
  k: number,
): Promise<RetrieveHit[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key || key.length === 0) {
    return []
  }
  const openai = new OpenAI({ apiKey: key })
  const model = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
  let qe
  try {
    qe = await openai.embeddings.create({ model, input: [query] })
  } catch {
    return []
  }
  const qv = qe.data[0]!.embedding as number[]
  const vlit = vectorToPgLiteral(qv)
  const vectorSql = `
      SELECT
        ch.content,
        ch.source,
        ch.part_index AS "partIndex",
        d.title AS "docTitle",
        1 - (ch.embedding <=> $1::vector) AS score
      FROM chunks ch
      INNER JOIN documents d ON d.id = ch.document_id
      INNER JOIN corpora co ON co.user_id = d.corpus_user_id AND co.id = d.corpus_id
      WHERE co.id = $2 AND co.user_id = $3
        AND ch.embedding IS NOT NULL
      ORDER BY ch.embedding <=> $1::vector
      LIMIT $4
    `
  let res = await pool.query<{
    content: string
    source: string
    docTitle: string
    score: string
  }>(vectorSql, [vlit, corpusId, userId, k])

  if (res.rows.length === 0) {
    const heal = await embedPendingChunksForCorpus(db, userId, corpusId)
    if (heal.embedded > 0) {
      res = await pool.query(vectorSql, [vlit, corpusId, userId, k])
    }
  }

  return res.rows.map((r) => ({
    text: r.content,
    source: r.source,
    docTitle: r.docTitle,
    score: Number.parseFloat(r.score),
  }))
}
