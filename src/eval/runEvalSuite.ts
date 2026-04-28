import OpenAI from 'openai'
import { DEFAULT_RETRIEVE_CORPUS } from '../data/defaultRetrieveCorpus'
import { chunkCorpus } from '../engine/retrieve/chunk'
import { rankByBm25 } from '../engine/retrieve/bm25'
import { rankChunksByCosine } from '../lib/embedClient'
import { mrrFirstGold, recallAtK, rowToChunkKey } from './metrics'

export type EvalCaseJson = {
  id: string
  query: string
  /** Expected passage keys: `doc-N#M` from `chunkKey()`. */
  goldChunkKeys: string[]
}

export type EvalManifestJson = {
  version: number
  description?: string
  chunkSize: number
  chunkOverlap: number
  corpusRef?: string
  corpus?: string
  cases: EvalCaseJson[]
}

export type EvalMode = 'bm25' | 'cosine'

export type CaseResult = {
  id: string
  query: string
  recall1: number
  recall3: number
  recall5: number
  mrr: number
}

export type SuiteResult = {
  mode: EvalMode
  chunkCount: number
  ks: readonly number[]
  cases: CaseResult[]
  /** Mean recall@k across cases */
  meanRecall: Record<number, number>
  meanMrr: number
}

const KS = [1, 3, 5] as const

function resolveCorpus(m: EvalManifestJson): string {
  if (m.corpus != null && m.corpus.length > 0) {
    return m.corpus
  }
  if (m.corpusRef === 'builtin:default' || m.corpusRef == null) {
    return DEFAULT_RETRIEVE_CORPUS
  }
  throw new Error(`Unknown corpusRef: ${String(m.corpusRef)}`)
}

async function rankCosineOpenAI(
  query: string,
  chunks: import('../engine/retrieve/chunk').TextChunk[],
  signal: AbortSignal,
): Promise<{ docTitle: string; partIndex: number; text: string; score: number }[]> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('OPENAI_API_KEY is required for cosine eval')
  }
  const model = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
  const openai = new OpenAI({ apiKey: key })
  const batchSize = 32
  const qe = await openai.embeddings.create(
    { model, input: [query] },
    { signal },
  )
  const qv = qe.data[0]!.embedding as number[]
  const allTexts = chunks.map((c) => c.text)
  const vecs: number[][] = []
  for (let i = 0; i < allTexts.length; i += batchSize) {
    const batch = allTexts.slice(i, i + batchSize)
    const res = await openai.embeddings.create(
      { model, input: batch },
      { signal },
    )
    const sorted = [...res.data].sort((a, b) => a.index - b.index)
    vecs.push(...sorted.map((d) => d.embedding as number[]))
  }
  if (vecs.length !== chunks.length) {
    throw new Error('Embedding count mismatch')
  }
  return rankChunksByCosine(qv, vecs, chunks)
}

export async function runEvalSuite(
  manifest: EvalManifestJson,
  mode: EvalMode,
  signal: AbortSignal = new AbortController().signal,
): Promise<SuiteResult> {
  const corpus = resolveCorpus(manifest)
  const chunks = chunkCorpus(corpus, {
    chunkSize: manifest.chunkSize,
    chunkOverlap: manifest.chunkOverlap,
  })

  const cases: CaseResult[] = []
  const accum: Record<number, number> = { 1: 0, 3: 0, 5: 0 }
  let mrrSum = 0

  for (const c of manifest.cases) {
    let ranked: { docTitle: string; partIndex: number; text: string; score: number }[]
    if (mode === 'bm25') {
      ranked = rankByBm25(c.query, chunks)
    } else {
      ranked = await rankCosineOpenAI(c.query, chunks, signal)
    }

    const predictedKeys: string[] = []
    const seenKeys = new Set<string>()
    for (const row of ranked) {
      const key = rowToChunkKey(row, chunks)
      if (key != null && !seenKeys.has(key)) {
        seenKeys.add(key)
        predictedKeys.push(key)
      }
    }

    const r1 = recallAtK(c.goldChunkKeys, predictedKeys, 1)
    const r3 = recallAtK(c.goldChunkKeys, predictedKeys, 3)
    const r5 = recallAtK(c.goldChunkKeys, predictedKeys, 5)
    const mrr = mrrFirstGold(c.goldChunkKeys, predictedKeys)

    accum[1] += r1
    accum[3] += r3
    accum[5] += r5
    mrrSum += mrr

    cases.push({
      id: c.id,
      query: c.query,
      recall1: r1,
      recall3: r3,
      recall5: r5,
      mrr,
    })
  }

  const n = manifest.cases.length || 1
  const meanRecall: Record<number, number> = {
    1: accum[1] / n,
    3: accum[3] / n,
    5: accum[5] / n,
  }

  return {
    mode,
    chunkCount: chunks.length,
    ks: KS,
    cases,
    meanRecall,
    meanMrr: mrrSum / n,
  }
}

export function formatSuiteReport(result: SuiteResult): string {
  const lines: string[] = []
  lines.push(`mode=${result.mode}  chunks=${result.chunkCount}`)
  lines.push(
    `mean recall@1=${result.meanRecall[1]!.toFixed(3)}  recall@3=${result.meanRecall[3]!.toFixed(3)}  recall@5=${result.meanRecall[5]!.toFixed(3)}  MRR=${result.meanMrr.toFixed(3)}`,
  )
  lines.push('')
  lines.push('id'.padEnd(22) + 'R@1'.padEnd(8) + 'R@3'.padEnd(8) + 'R@5'.padEnd(8) + 'MRR')
  for (const c of result.cases) {
    lines.push(
      c.id.padEnd(22) +
        c.recall1.toFixed(2).padEnd(8) +
        c.recall3.toFixed(2).padEnd(8) +
        c.recall5.toFixed(2).padEnd(8) +
        c.mrr.toFixed(3),
    )
  }
  return lines.join('\n')
}
