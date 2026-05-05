import { z } from 'zod'
import type { SerializedGraphJson } from '../db/schema.js'
import type { ServerNodeOutput } from './serverExecutors.js'
import { spamJudgeResultZ } from '../../src/lib/spamJudgeResult.js'

const spamCombinePortZ = z.object({
  finalAction: z.enum(['allow', 'shadow', 'quarantine', 'remove']),
  llmScore: z.number(),
  ruleScore: z.number(),
})

export function graphUsesSpamStageBV2(data: SerializedGraphJson): boolean {
  let hasJudge = false
  let hasCombine = false
  for (const [, raw] of data.nodes) {
    const t = (raw as { type?: string }).type
    if (t === 'SpamJudge') hasJudge = true
    if (t === 'SpamCombine') hasCombine = true
  }
  return hasJudge && hasCombine
}

/**
 * Read the last SpamJudge / SpamCombine outputs in topo order (for Stage B v2 graphs).
 */
export function extractSpamStageBv2Outputs(
  data: SerializedGraphJson,
  order: string[],
  outputs: Map<string, ServerNodeOutput>,
):
  | {
      judge: z.infer<typeof spamJudgeResultZ>
      combine: z.infer<typeof spamCombinePortZ>
    }
  | null {
  const nodeType = new Map(
    data.nodes.map(([id, n]) => [id, (n as { type?: string }).type]),
  )
  let judgeText: string | null = null
  let combineText: string | null = null
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!
    const t = nodeType.get(id)
    if (t === 'SpamJudge' && judgeText == null) {
      const v = outputs.get(`${id}:0`)
      judgeText = v?.type === 'TEXT' ? v.text : null
    }
    if (t === 'SpamCombine' && combineText == null) {
      const v = outputs.get(`${id}:0`)
      combineText = v?.type === 'TEXT' ? v.text : null
    }
    if (judgeText != null && combineText != null) break
  }
  if (judgeText == null || combineText == null) return null
  try {
    const judge = spamJudgeResultZ.parse(JSON.parse(judgeText) as unknown)
    const combine = spamCombinePortZ.parse(JSON.parse(combineText) as unknown)
    return { judge, combine }
  } catch {
    return null
  }
}
