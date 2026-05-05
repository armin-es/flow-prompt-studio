import type pg from 'pg'
import type { RetrieveFormatRow } from '../../src/engine/retrieve/formatRetrieveOutput.js'
import type { SpamDb } from './spamBaselineRules.js'
import {
  resolveSpamExampleCorpus,
  resolveSpamPolicyCorpus,
} from './spamCorpusResolve.js'
import { retrieveCosineChunks } from './spamRetrieveCosine.js'

export type SpamStageBAccum = {
  exampleHits: Array<{ text: string; score: number }>
  policyHits: Array<{ text: string; score: number }>
}

export async function execSpamRetrieveExamples(
  db: SpamDb,
  pool: pg.Pool,
  userId: string,
  query: string,
  categoryId: string | null,
  k: number,
  accum: SpamStageBAccum | undefined,
): Promise<{ rows: RetrieveFormatRow[] }> {
  const { corpusUserId, corpusId } = await resolveSpamExampleCorpus(db, userId, categoryId)
  const hits = await retrieveCosineChunks(db, pool, corpusUserId, corpusId, query, k)
  if (accum) {
    accum.exampleHits = hits.map((h) => ({ text: h.text, score: h.score }))
  }
  const rows: RetrieveFormatRow[] = hits.map((h) => ({
    text: h.text,
    source: h.source,
    score: h.score,
    docTitle: h.docTitle,
    partIndex: 1,
  }))
  return { rows }
}

export async function execSpamRetrievePolicy(
  db: SpamDb,
  pool: pg.Pool,
  userId: string,
  query: string,
  categoryId: string | null,
  k: number,
  accum: SpamStageBAccum | undefined,
): Promise<{ rows: RetrieveFormatRow[] }> {
  const { corpusUserId, corpusId } = await resolveSpamPolicyCorpus(db, userId, categoryId)
  const hits = await retrieveCosineChunks(db, pool, corpusUserId, corpusId, query, k)
  if (accum) {
    accum.policyHits = hits.map((h) => ({ text: h.text, score: h.score }))
  }
  const rows: RetrieveFormatRow[] = hits.map((h) => ({
    text: h.text,
    source: h.source,
    score: h.score,
    docTitle: h.docTitle,
    partIndex: 1,
  }))
  return { rows }
}
