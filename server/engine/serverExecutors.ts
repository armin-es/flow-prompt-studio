import OpenAI from 'openai'
import { and, eq } from 'drizzle-orm'
import type { SpamDb } from '../spam/spamBaselineRules.js'
import { spamItems } from '../db/schema.js'
import {
  deriveStatusAfterRules,
  evaluateSpamRules,
  type SpamRuleRow,
} from '../spam/spamRulesEngine.js'
import { loadSpamRulesForEvaluation } from '../spam/spamRulesLoad.js'
import { buildStageBUserMessageSuffix } from '../spam/stageBMessages.js'
import type { GraphNode } from '../../src/types/index.js'

export type ServerNodeOutput = { type: 'TEXT'; text: string }

export type ServerExecutorContext = {
  db: SpamDb
  userId: string
  signal?: AbortSignal
  /** When set, `AppSpamItemSource` uses this instead of widgetValues[0]. */
  spamItemId?: string
  openai?: OpenAI
  openaiModel?: string
  /** When set, `AppLlm` appends Stage B retrieval payload after the graph prompt. */
  stageBLlmAugment?: { userPayload: Record<string, unknown> }
}

export type ServerExecutor = (
  node: GraphNode,
  inputs: Record<number, ServerNodeOutput | undefined>,
  ctx: ServerExecutorContext,
) => Promise<Record<number, ServerNodeOutput>>

function textFrom(port: ServerNodeOutput | undefined): string {
  if (!port || port.type !== 'TEXT') return ''
  return String(port.text ?? '')
}

function getExecutor(nodeType: string): ServerExecutor {
  const ex = serverExecutors[nodeType]
  if (!ex) {
    throw new Error(`Unsupported node type for server execution: ${nodeType}`)
  }
  return ex
}

export const serverExecutors: Record<string, ServerExecutor> = {
  AppInput: async (node) => {
    const text = String(node.widgetValues[0] ?? '')
    return { 0: { type: 'TEXT', text } }
  },

  AppOutput: async (_node, inputs) => {
    const v = inputs[0]
    return { 0: { type: 'TEXT', text: textFrom(v) } }
  },

  AppTee: async (_node, inputs) => {
    const t = textFrom(inputs[0])
    return {
      0: { type: 'TEXT', text: t },
      1: { type: 'TEXT', text: t },
    }
  },

  AppJoin: async (node, inputs) => {
    const sep = String(node.widgetValues[0] ?? '\n')
    const a = textFrom(inputs[0])
    const b = textFrom(inputs[1])
    return { 0: { type: 'TEXT', text: `${a}${sep}${b}` } }
  },

  AppSpamItemSource: async (node, inputs, ctx) => {
    void inputs
    const raw = (ctx.spamItemId ?? String(node.widgetValues[0] ?? '')).trim()
    if (!raw) {
      throw new Error('Spam item: set widget item id or pass spamItemId in run context.')
    }
    const [row] = await ctx.db
      .select({
        body: spamItems.body,
        authorFeatures: spamItems.authorFeatures,
      })
      .from(spamItems)
      .where(and(eq(spamItems.id, raw), eq(spamItems.userId, ctx.userId)))
      .limit(1)
    if (!row) {
      throw new Error(`Spam item: no row for id ${raw}`)
    }
    const body = row.body ?? ''
    const featJson = JSON.stringify(row.authorFeatures ?? {}, null, 2)
    return {
      0: { type: 'TEXT', text: body },
      1: { type: 'TEXT', text: featJson },
    }
  },

  AppSpamRules: async (_node, inputs, ctx) => {
    const body = textFrom(inputs[0])
    if (!body.trim()) {
      throw new Error('Spam rules: connect a TEXT body.')
    }
    let authorFeatures: Record<string, unknown> = {}
    const featText = textFrom(inputs[1])
    if (featText.trim()) {
      try {
        const j = JSON.parse(featText) as unknown
        if (typeof j === 'object' && j != null && !Array.isArray(j)) {
          authorFeatures = j as Record<string, unknown>
        } else {
          throw new Error('must be a JSON object')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`Spam rules: optional input 1 must be JSON object (${msg}).`, {
          cause: e,
        })
      }
    }
    const ruleRows: SpamRuleRow[] = await loadSpamRulesForEvaluation(ctx.db, ctx.userId)
    const { score, matches } = evaluateSpamRules(body, authorFeatures, ruleRows)
    const derivedStatus = deriveStatusAfterRules(score)
    const text = JSON.stringify(
      { score, derivedStatus, matches },
      null,
      2,
    )
    return { 0: { type: 'TEXT', text } }
  },

  AppLlm: async (node, inputs, ctx) => {
    let prompt = textFrom(inputs[0])
    if (prompt.length === 0) {
      throw new Error('AppLlm: no prompt (connect upstream TEXT).')
    }
    if (ctx.stageBLlmAugment) {
      prompt += '\n\n' + buildStageBUserMessageSuffix(ctx.stageBLlmAugment.userPayload)
    }
    const systemRaw = String(node.widgetValues[0] ?? '')
    const system = systemRaw.trim().length > 0 ? systemRaw : undefined
    if (!ctx.openai) {
      throw new Error('AppLlm: OpenAI client missing in server run context.')
    }
    const model = ctx.openaiModel ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    const completion = await ctx.openai.chat.completions.create(
      {
        model,
        response_format: { type: 'json_object' },
        messages: [
          ...(system != null && system.length > 0
            ? [{ role: 'system' as const, content: system }]
            : []),
          { role: 'user' as const, content: prompt },
        ],
      },
      ctx.signal != null ? { signal: ctx.signal } : undefined,
    )
    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    return { 0: { type: 'TEXT', text } }
  },
}

export { getExecutor }
