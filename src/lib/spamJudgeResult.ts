import { z } from 'zod'

/** Parsed Stage-B judge output (legacy AppLlm + SpamJudge). */
export const spamJudgeResultZ = z
  .object({
    verdict: z.enum(['ham', 'spam', 'unsure']),
    confidence: z.number(),
    rationale: z.string(),
    citedExample: z.string().optional(),
    citedPolicy: z.string().optional(),
  })
  .transform((o) => ({
    verdict: o.verdict,
    confidence: Math.min(1, Math.max(0, o.confidence)),
    rationale: o.rationale,
    citedExample: o.citedExample ?? '',
    citedPolicy: o.citedPolicy ?? '',
  }))

export type SpamJudgeResult = z.infer<typeof spamJudgeResultZ>
