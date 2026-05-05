import type { GraphNode } from '../types/index.js'

export type SpamPasteTextOutput = { type: 'TEXT'; text: string }

function coerceInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

/**
 * Legacy graphs stored `[body, featuresJsonString]`; newer graphs use
 * `[body, accountAgeDays, priorStrikes]` (numbers).
 */
export function migrateSpamPasteWidgets(w: unknown[]): unknown[] {
  const body = String(w[0] ?? '')
  if (w.length >= 3) {
    return [body, coerceInt(w[1], 0), coerceInt(w[2], 0)]
  }
  if (w.length === 2) {
    const second = w[1]
    if (typeof second === 'string') {
      const s = second.trim()
      if (s.startsWith('{')) {
        try {
          const j = JSON.parse(s) as Record<string, unknown>
          return [
            body,
            coerceInt(j.account_age_days, 0),
            coerceInt(j.prior_strikes, 0),
          ]
        } catch {
          return [body, 0, 0]
        }
      }
    }
    return [body, coerceInt(second, 0), 0]
  }
  return [body, 0, 0]
}

/** Source-only node: widgets → body TEXT + built author-features JSON (matches Spam item ports). */
export function spamPasteOutputs(node: GraphNode): Record<number, SpamPasteTextOutput> {
  const body = String(node.widgetValues[0] ?? '').trim()
  if (!body) {
    throw new Error('Spam paste: enter sample post body.')
  }
  const accountAgeDays = coerceInt(node.widgetValues[1], 0)
  const priorStrikes = coerceInt(node.widgetValues[2], 0)
  const authorFeatures: Record<string, unknown> = {
    account_age_days: accountAgeDays,
    prior_strikes: priorStrikes,
  }
  const featJson = JSON.stringify(authorFeatures, null, 2)
  return {
    0: { type: 'TEXT', text: body },
    1: { type: 'TEXT', text: featJson },
  }
}
