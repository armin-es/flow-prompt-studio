import OpenAI from 'openai'
import { and, eq } from 'drizzle-orm'
import { getDb, getPool } from '../db/client.js'
import { graphs, spamCategories, spamDecisions, spamItems, runs } from '../db/schema.js'
import type { SerializedGraphJson } from '../db/schema.js'
import type { SpamDb } from './spamBaselineRules.js'
import {
  SPAM_POLICY_CORPUS_ID,
  SPAM_EXAMPLES_CORPUS_ID,
  ensureSpamSeedCorpora,
} from './spamSeedCorpora.js'
import { retrieveCosineChunks } from './spamRetrieveCosine.js'
import { deriveStatusAfterRules } from './spamRulesEngine.js'
import { combineSpamStageB } from './spamCombineStageB.js'
import { spamJudgeResultZ } from '../../src/lib/spamJudgeResult.js'
import type { SpamJudgeResult } from '../../src/lib/spamJudgeResult.js'

import {
  runSavedGraph,
  getPrimaryAppLlmText,
} from '../engine/runSavedGraph.js'
import {
  extractSpamStageBv2Outputs,
  graphUsesSpamStageBV2,
} from '../engine/spamStageBGraph.js'

export type StageBJudge = SpamJudgeResult

function rulesOnlyFallback(ruleScore: number): {
  finalAction: 'allow' | 'shadow' | 'quarantine' | 'remove'
  llmScore: null
} {
  const st = deriveStatusAfterRules(ruleScore)
  const fa =
    st === 'allowed'
      ? 'allow'
      : st === 'quarantined'
        ? 'quarantine'
        : 'shadow'
  return { finalAction: fa, llmScore: null }
}

/** Default Stage-B graph: retrieval + SpamJudge + SpamCombine (v2 pipeline). */
const SPAM_DEFAULT_GRAPH_DATA: SerializedGraphJson = {
  version: 1,
  nodes: [
    [
      'spam-src',
      {
        id: 'spam-src',
        type: 'AppSpamItemSource',
        label: 'Spam item',
        position: { x: 40, y: 200 },
        width: 280,
        height: 170,
        inputs: [],
        outputs: [
          { name: 'body', dataType: 'TEXT' },
          { name: 'features JSON', dataType: 'TEXT' },
        ],
        widgetValues: [''],
      },
    ],
    [
      'spam-rules',
      {
        id: 'spam-rules',
        type: 'AppSpamRules',
        label: 'Spam rules (Stage A)',
        position: { x: 400, y: 380 },
        width: 300,
        height: 200,
        inputs: [
          { name: 'body', dataType: 'TEXT' },
          { name: 'features JSON', dataType: 'TEXT' },
        ],
        outputs: [{ name: 'scores', dataType: 'TEXT' }],
        widgetValues: [],
      },
    ],
    [
      'spam-ex',
      {
        id: 'spam-ex',
        type: 'SpamRetrieveExamples',
        label: 'Retrieve examples',
        position: { x: 400, y: 80 },
        width: 300,
        height: 170,
        inputs: [
          { name: 'body', dataType: 'TEXT' },
          { name: 'categoryId', dataType: 'TEXT' },
        ],
        outputs: [{ name: 'passages', dataType: 'TEXT' }],
        widgetValues: ['', 5],
      },
    ],
    [
      'spam-pol',
      {
        id: 'spam-pol',
        type: 'SpamRetrievePolicy',
        label: 'Retrieve policy',
        position: { x: 400, y: 240 },
        width: 300,
        height: 170,
        inputs: [
          { name: 'body', dataType: 'TEXT' },
          { name: 'categoryId', dataType: 'TEXT' },
        ],
        outputs: [{ name: 'passages', dataType: 'TEXT' }],
        widgetValues: ['', 3],
      },
    ],
    [
      'spam-judge',
      {
        id: 'spam-judge',
        type: 'SpamJudge',
        label: 'Spam judge',
        position: { x: 780, y: 140 },
        width: 340,
        height: 260,
        inputs: [
          { name: 'body', dataType: 'TEXT' },
          { name: 'features JSON', dataType: 'TEXT' },
          { name: 'examples', dataType: 'TEXT' },
          { name: 'policy', dataType: 'TEXT' },
        ],
        outputs: [{ name: 'verdict JSON', dataType: 'TEXT' }],
        widgetValues: ['gpt-4o-mini', 0, 0],
      },
    ],
    [
      'spam-combine',
      {
        id: 'spam-combine',
        type: 'SpamCombine',
        label: 'Combine rules + judge',
        position: { x: 1180, y: 220 },
        width: 320,
        height: 160,
        inputs: [
          { name: 'rules JSON', dataType: 'TEXT' },
          { name: 'judge JSON', dataType: 'TEXT' },
        ],
        outputs: [{ name: 'combined JSON', dataType: 'TEXT' }],
        widgetValues: [],
      },
    ],
    [
      'spam-out',
      {
        id: 'spam-out',
        type: 'AppOutput',
        label: 'Verdict JSON',
        position: { x: 1560, y: 240 },
        width: 300,
        height: 120,
        inputs: [{ name: 'in', dataType: 'TEXT' }],
        outputs: [],
        widgetValues: [],
      },
    ],
  ],
  edges: [
    [
      'spam-ev2-a',
      {
        id: 'spam-ev2-a',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 0,
        targetNodeId: 'spam-rules',
        targetPortIndex: 0,
      },
    ],
    [
      'spam-ev2-b',
      {
        id: 'spam-ev2-b',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 1,
        targetNodeId: 'spam-rules',
        targetPortIndex: 1,
      },
    ],
    [
      'spam-ev2-c',
      {
        id: 'spam-ev2-c',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 0,
        targetNodeId: 'spam-ex',
        targetPortIndex: 0,
      },
    ],
    [
      'spam-ev2-d',
      {
        id: 'spam-ev2-d',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 0,
        targetNodeId: 'spam-pol',
        targetPortIndex: 0,
      },
    ],
    [
      'spam-ev2-e',
      {
        id: 'spam-ev2-e',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 0,
        targetNodeId: 'spam-judge',
        targetPortIndex: 0,
      },
    ],
    [
      'spam-ev2-f',
      {
        id: 'spam-ev2-f',
        sourceNodeId: 'spam-src',
        sourcePortIndex: 1,
        targetNodeId: 'spam-judge',
        targetPortIndex: 1,
      },
    ],
    [
      'spam-ev2-g',
      {
        id: 'spam-ev2-g',
        sourceNodeId: 'spam-ex',
        sourcePortIndex: 0,
        targetNodeId: 'spam-judge',
        targetPortIndex: 2,
      },
    ],
    [
      'spam-ev2-h',
      {
        id: 'spam-ev2-h',
        sourceNodeId: 'spam-pol',
        sourcePortIndex: 0,
        targetNodeId: 'spam-judge',
        targetPortIndex: 3,
      },
    ],
    [
      'spam-ev2-i',
      {
        id: 'spam-ev2-i',
        sourceNodeId: 'spam-rules',
        sourcePortIndex: 0,
        targetNodeId: 'spam-combine',
        targetPortIndex: 0,
      },
    ],
    [
      'spam-ev2-j',
      {
        id: 'spam-ev2-j',
        sourceNodeId: 'spam-judge',
        sourcePortIndex: 0,
        targetNodeId: 'spam-combine',
        targetPortIndex: 1,
      },
    ],
    [
      'spam-ev2-k',
      {
        id: 'spam-ev2-k',
        sourceNodeId: 'spam-combine',
        sourcePortIndex: 0,
        targetNodeId: 'spam-out',
        targetPortIndex: 0,
      },
    ],
  ],
  selection: [],
  edgeSelection: [],
}

export async function ensureSpamDefaultGraphForApi(
  db: SpamDb,
  userId: string,
): Promise<string | null> {
  const g = await ensureSpamDefaultGraph(db, userId)
  return g?.id ?? null
}

async function ensureSpamDefaultGraph(
  db: SpamDb,
  userId: string,
): Promise<{ id: string; data: SerializedGraphJson } | null> {
  const found = await db
    .select({ id: graphs.id, data: graphs.data })
    .from(graphs)
    .where(and(eq(graphs.userId, userId), eq(graphs.name, 'spam-default')))
    .limit(1)
  if (found.length > 0) {
    return { id: found[0]!.id, data: found[0]!.data }
  }
  const [row] = await db
    .insert(graphs)
    .values({
      userId,
      name: 'spam-default',
      data: SPAM_DEFAULT_GRAPH_DATA,
      isPublic: false,
    })
    .returning({ id: graphs.id, data: graphs.data })
  if (!row) return null
  return { id: row.id, data: row.data }
}

export async function runSpamStageB(
  db: SpamDb,
  userId: string,
  itemId: string,
): Promise<
  | { ok: true; skipped?: string; finalAction?: string; runId?: string }
  | { ok: false; error: string }
> {
  const pool = getPool()
  if (pool == null) {
    return { ok: false, error: 'Database pool not available' }
  }

  const [item] = await db
    .select({
      id: spamItems.id,
      body: spamItems.body,
      authorFeatures: spamItems.authorFeatures,
      status: spamItems.status,
      ruleScore: spamItems.ruleScore,
      categoryId: spamItems.categoryId,
      runId: spamItems.runId,
    })
    .from(spamItems)
    .where(and(eq(spamItems.id, itemId), eq(spamItems.userId, userId)))
    .limit(1)

  if (!item) {
    return { ok: false, error: 'item not found' }
  }

  if (item.status === 'allowed') {
    return { ok: true, skipped: 'allowed_by_stage_a' }
  }

  if (item.status === 'decided' || item.status === 'dropped') {
    return { ok: true, skipped: 'already_finalized' }
  }

  if (item.runId != null) {
    return { ok: true, skipped: 'stage_b_already_complete', runId: item.runId }
  }

  await ensureSpamSeedCorpora(db, userId)
  const graph = await ensureSpamDefaultGraph(db, userId)
  const graphId = graph?.id ?? null
  const graphData: SerializedGraphJson = graph?.data ?? SPAM_DEFAULT_GRAPH_DATA

  const ruleScore = item.ruleScore ?? 0

  const useV2 = graphUsesSpamStageBV2(graphData)

  if (useV2) {
    const accum = {
      exampleHits: [] as Array<{ text: string; score: number }>,
      policyHits: [] as Array<{ text: string; score: number }>,
    }
    const key = process.env.OPENAI_API_KEY?.trim()
    const openai = key ? new OpenAI({ apiKey: key }) : undefined
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    try {
      const run = await runSavedGraph(db, userId, graphData, {
        spamItemId: itemId,
        openai,
        openaiModel: model,
        spamStageBAccum: accum,
        spamItemCategoryId: item.categoryId,
      })
      if (!run.ok) {
        throw new Error(run.error)
      }
      const v2 = extractSpamStageBv2Outputs(graphData, run.order, run.outputs)
      if (v2 == null) {
        throw new Error(
          'Stage B v2 graph did not produce parsable SpamJudge + SpamCombine outputs',
        )
      }
      await finishSpamStageB(db, userId, itemId, graphId, {
        judge: v2.judge,
        finalAction: v2.combine.finalAction,
        llmScore: v2.combine.llmScore,
        exampleHits: accum.exampleHits,
        policyHits: accum.policyHits,
        usedLlm: Boolean(key),
      })
      return { ok: true, finalAction: v2.combine.finalAction }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[spam stage-b] v2 judge failed', e)
      const fb = rulesOnlyFallback(ruleScore)
      await finishSpamStageB(db, userId, itemId, graphId, {
        judge: {
          verdict: 'unsure',
          confidence: 0,
          rationale: `Judge failed (${msg}); applied rules-only combine.`,
          citedExample: accum.exampleHits[0]?.text.slice(0, 200) ?? '',
          citedPolicy: accum.policyHits[0]?.text.slice(0, 200) ?? '',
        },
        finalAction: fb.finalAction,
        llmScore: null,
        exampleHits: accum.exampleHits,
        policyHits: accum.policyHits,
        usedLlm: false,
      })
      return { ok: true, finalAction: fb.finalAction }
    }
  }

  const catRows = item.categoryId
    ? await db
        .select({
          corpusUserId: spamCategories.corpusUserId,
          corpusId: spamCategories.corpusId,
          policyCorpusUserId: spamCategories.policyCorpusUserId,
          policyCorpusId: spamCategories.policyCorpusId,
        })
        .from(spamCategories)
        .where(and(eq(spamCategories.id, item.categoryId!), eq(spamCategories.userId, userId)))
        .limit(1)
    : []

  const corpusUid = catRows[0]?.corpusUserId ?? userId
  const exCorpus = catRows[0]?.corpusId ?? SPAM_EXAMPLES_CORPUS_ID
  const polUid = catRows[0]?.policyCorpusUserId ?? userId
  const polCorpus = catRows[0]?.policyCorpusId ?? SPAM_POLICY_CORPUS_ID

  const feats =
    typeof item.authorFeatures === 'object' &&
    item.authorFeatures != null &&
    !Array.isArray(item.authorFeatures)
      ? (item.authorFeatures as Record<string, unknown>)
      : {}

  const exampleHits = await retrieveCosineChunks(db, pool, corpusUid, exCorpus, item.body, 4)
  const policyHits = await retrieveCosineChunks(db, pool, polUid, polCorpus, item.body, 4)

  const keyLegacy = process.env.OPENAI_API_KEY?.trim()

  if (!keyLegacy) {
    const fb = rulesOnlyFallback(ruleScore)
    await finishSpamStageB(db, userId, itemId, graphId, {
      judge: {
        verdict: 'unsure',
        confidence: 0,
        rationale: 'OPENAI_API_KEY not set; applied rules-only combine.',
        citedExample: exampleHits[0]?.text.slice(0, 200) ?? '',
        citedPolicy: policyHits[0]?.text.slice(0, 200) ?? '',
      },
      finalAction: fb.finalAction,
      llmScore: null,
      exampleHits,
      policyHits,
      usedLlm: false,
    })
    return { ok: true, finalAction: fb.finalAction }
  }

  const openaiLegacy = new OpenAI({ apiKey: keyLegacy })
  const modelLegacy = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

  const userPayload = {
    post: item.body,
    author_features: feats,
    rule_score: ruleScore,
    nearest_spam_examples: exampleHits.map((h, i) => ({
      rank: i + 1,
      score: h.score,
      excerpt: h.text.slice(0, 900),
    })),
    policy_chunks: policyHits.map((h, i) => ({
      rank: i + 1,
      score: h.score,
      excerpt: h.text.slice(0, 900),
    })),
  }

  let judge: StageBJudge

  try {
    const run = await runSavedGraph(db, userId, graphData, {
      spamItemId: itemId,
      openai: openaiLegacy,
      openaiModel: modelLegacy,
      stageBLlmAugment: { userPayload },
    })
    if (!run.ok) {
      throw new Error(run.error)
    }
    const raw = getPrimaryAppLlmText(graphData, run.order, run.outputs)
    if (raw == null || !raw.trim()) {
      throw new Error('Stage B graph produced no AppLlm output')
    }
    judge = spamJudgeResultZ.parse(JSON.parse(raw) as unknown)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[spam stage-b] judge failed', e)
    const fb = rulesOnlyFallback(ruleScore)
    await finishSpamStageB(db, userId, itemId, graphId, {
      judge: {
        verdict: 'unsure',
        confidence: 0,
        rationale: `Judge failed (${msg}); applied rules-only combine.`,
        citedExample: exampleHits[0]?.text.slice(0, 200) ?? '',
        citedPolicy: policyHits[0]?.text.slice(0, 200) ?? '',
      },
      finalAction: fb.finalAction,
      llmScore: null,
      exampleHits,
      policyHits,
      usedLlm: false,
    })
    return { ok: true, finalAction: fb.finalAction }
  }

  const combined = combineSpamStageB(ruleScore, judge)

  await finishSpamStageB(db, userId, itemId, graphId, {
    judge,
    finalAction: combined.finalAction,
    llmScore: combined.llmScore,
    exampleHits,
    policyHits,
    usedLlm: true,
  })

  return { ok: true, finalAction: combined.finalAction }
}

async function finishSpamStageB(
  db: SpamDb,
  userId: string,
  itemId: string,
  graphId: string | null,
  payload: {
    judge: StageBJudge
    finalAction: 'allow' | 'shadow' | 'quarantine' | 'remove'
    llmScore: number | null
    exampleHits: { text: string; score: number }[]
    policyHits: { text: string; score: number }[]
    usedLlm: boolean
  },
): Promise<void> {
  const summaryObj = {
    stage: 'spamStageB',
    judge: payload.judge,
    exampleSnippets: payload.exampleHits.slice(0, 3).map((h) => h.text.slice(0, 280)),
    policySnippets: payload.policyHits.slice(0, 3).map((h) => h.text.slice(0, 280)),
    usedLlm: payload.usedLlm,
    finalAction: payload.finalAction,
  }

  const [runRow] = await db
    .insert(runs)
    .values({
      userId,
      graphId,
      status: 'ok',
      finishedAt: new Date(),
      summary: JSON.stringify(summaryObj),
    })
    .returning({ id: runs.id })

  await db.insert(spamDecisions).values({
    itemId,
    reviewerId: null,
    action: payload.finalAction,
    rationale: payload.judge.rationale,
    policyQuote: payload.judge.citedPolicy.length > 0 ? payload.judge.citedPolicy : null,
    agreedWithLlm: null,
  })

  const triageAfterStageB =
    payload.finalAction === 'quarantine' || payload.finalAction === 'remove'
      ? 'quarantined'
      : 'queued'

  await db
    .update(spamItems)
    .set({
      llmScore: payload.llmScore,
      finalAction: payload.finalAction,
      status: triageAfterStageB,
      runId: runRow!.id,
      graphId,
      decidedAt: null,
    })
    .where(and(eq(spamItems.id, itemId), eq(spamItems.userId, userId)))
}

/** Queue Stage B on the macrotask queue (after ingest). */
export function queueSpamStageB(userId: string, itemId: string): void {
  setImmediate(() => {
    const db = getDb()
    if (db == null) return
    void runSpamStageB(db, userId, itemId).catch((e) => {
      console.error('[spam] Stage B failed', e)
    })
  })
}
