import { z } from 'zod'

/** Score at or below → auto-allow (Stage A only). */
export const SPAM_TAU_ALLOW = 2

/** Score at or above → auto-quarantine pending Stage B / human. */
export const SPAM_TAU_QUARANTINE = 8

const regexConfigSchema = z.object({
  pattern: z.string().min(1),
  flags: z.string().optional(),
  /** Add weight once per match (capped), not only on first match. */
  perMatch: z.boolean().optional(),
  maxMatches: z.number().int().min(1).max(50).optional(),
})

const urlDomainConfigSchema = z.object({
  domains: z.array(z.string().min(1)).min(1),
})

const featureThresholdConfigSchema = z.object({
  feature: z.string().min(1),
  op: z.enum(['gte', 'lte', 'eq']),
  value: z.number(),
})

export type SpamRuleRow = {
  id: string
  name: string
  enabled: boolean
  weight: number
  kind: string
  config: unknown
}

export type RuleMatch = {
  ruleId: string
  name: string
  contribution: number
}

function normalizeHost(raw: string): string {
  let h = raw.toLowerCase().trim()
  if (h.startsWith('www.')) h = h.slice(4)
  return h
}

/** Extract hosts from http(s) URLs in text (best-effort). */
export function extractUrlHosts(text: string): string[] {
  const re = /\bhttps?:\/\/([^/\s?#]+)/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(normalizeHost(m[1] ?? ''))
  }
  return out
}

function featureNumber(f: Record<string, unknown>, key: string): number | null {
  const v = f[key]
  if (v === undefined || v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Missing numeric features treated as 0 for thresholds (new accounts, etc.). */
function featureNumberOrZero(f: Record<string, unknown>, key: string): number {
  return featureNumber(f, key) ?? 0
}

export function deriveStatusAfterRules(score: number): 'allowed' | 'quarantined' | 'queued' {
  if (score <= SPAM_TAU_ALLOW) return 'allowed'
  if (score >= SPAM_TAU_QUARANTINE) return 'quarantined'
  return 'queued'
}

/**
 * Deterministic rule evaluation — no network, no LLM.
 * Invalid per-rule configs are skipped (no contribution).
 */
export function evaluateSpamRules(
  body: string,
  authorFeatures: Record<string, unknown>,
  rules: SpamRuleRow[],
): { score: number; matches: RuleMatch[] } {
  const matches: RuleMatch[] = []
  let score = 0

  for (const rule of rules) {
    if (!rule.enabled) continue
    const w = rule.weight
    let contribution = 0

    try {
      if (rule.kind === 'regex') {
        const cfg = regexConfigSchema.safeParse(rule.config)
        if (!cfg.success) continue
        const { pattern, flags, perMatch, maxMatches } = cfg.data
        if (perMatch) {
          const cap = maxMatches ?? 5
          const gflags = (flags ?? '').includes('g') ? flags : `${flags ?? ''}g`
          const rg = new RegExp(pattern, gflags)
          const n = Math.min([...body.matchAll(rg)].length, cap)
          contribution = n * w
        } else {
          const rx = new RegExp(pattern, flags ?? '')
          if (rx.test(body)) contribution = w
        }
      } else if (rule.kind === 'url-domain') {
        const cfg = urlDomainConfigSchema.safeParse(rule.config)
        if (!cfg.success) continue
        const blocked = cfg.data.domains.map(normalizeHost)
        const hosts = extractUrlHosts(body)
        for (const h of hosts) {
          for (const d of blocked) {
            if (h === d || h.endsWith(`.${d}`)) {
              contribution = w
              break
            }
          }
          if (contribution > 0) break
        }
      } else if (rule.kind === 'feature-threshold') {
        const cfg = featureThresholdConfigSchema.safeParse(rule.config)
        if (!cfg.success) continue
        const val =
          cfg.data.feature === 'account_age_days'
            ? featureNumberOrZero(authorFeatures, cfg.data.feature)
            : featureNumberOrZero(authorFeatures, cfg.data.feature)
        const t = cfg.data.value
        let ok = false
        if (cfg.data.op === 'gte') ok = val >= t
        else if (cfg.data.op === 'lte') ok = val <= t
        else ok = val === t
        if (ok) contribution = w
      }
    } catch {
      continue
    }

    if (contribution > 0) {
      score += contribution
      matches.push({
        ruleId: rule.id,
        name: rule.name,
        contribution,
      })
    }
  }

  return { score, matches }
}
