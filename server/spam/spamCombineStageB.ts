import type { SpamJudgeResult } from '../../src/lib/spamJudgeResult.js'
import { SPAM_TAU_ALLOW, SPAM_TAU_QUARANTINE } from './spamRulesEngine.js'

export type SpamCombineFinalAction = 'allow' | 'shadow' | 'quarantine' | 'remove'

/**
 * Deterministic merge of Stage-A rule score + LLM judge (same rules as historical Stage B).
 */
export function combineSpamStageB(
  ruleScore: number,
  judge: SpamJudgeResult,
): { finalAction: SpamCombineFinalAction; llmScore: number } {
  const llmScore = judge.confidence
  if (ruleScore >= SPAM_TAU_QUARANTINE) {
    if (judge.verdict === 'ham' && judge.confidence >= 0.78) {
      return { finalAction: 'shadow', llmScore }
    }
    return { finalAction: 'quarantine', llmScore }
  }
  if (judge.verdict === 'spam') {
    if (judge.confidence >= 0.88 && ruleScore >= 6) {
      return { finalAction: 'remove', llmScore }
    }
    if (judge.confidence >= 0.45) {
      return { finalAction: 'quarantine', llmScore }
    }
    return { finalAction: 'shadow', llmScore }
  }
  if (judge.verdict === 'ham') {
    if (judge.confidence >= 0.55 && ruleScore <= SPAM_TAU_ALLOW) {
      return { finalAction: 'allow', llmScore }
    }
    if (judge.confidence >= 0.55) {
      return { finalAction: 'shadow', llmScore }
    }
  }
  return { finalAction: 'shadow', llmScore }
}
