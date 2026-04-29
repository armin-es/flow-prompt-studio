import { count, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { spamRules } from '../db/schema.js'

export type SpamDb = NonNullable<ReturnType<typeof getDb>>

/** Idempotent: inserts baseline rows only when the user has zero rules. */
export async function ensureBaselineSpamRules(db: SpamDb, userId: string): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(spamRules)
    .where(eq(spamRules.userId, userId))
  if (Number(row?.n ?? 0) > 0) return

  await db.insert(spamRules).values([
    {
      userId,
      name: 'Repeated characters (aaaaa)',
      enabled: true,
      weight: 1.5,
      kind: 'regex',
      config: { pattern: '(.)\\1{4,}', flags: 'i' },
      version: 1,
    },
    {
      userId,
      name: 'Multiple outbound links',
      enabled: true,
      weight: 0.8,
      kind: 'regex',
      config: {
        pattern: String.raw`https?:\/\/[^\s]+`,
        flags: 'gi',
        perMatch: true,
        maxMatches: 5,
      },
      version: 1,
    },
    {
      userId,
      name: 'Crypto / wallet scams (keywords)',
      enabled: true,
      weight: 2,
      kind: 'regex',
      config: {
        pattern: '(crypto\\s+giveaway|seed\\s+phrase|verify\\s+your\\s+wallet)',
        flags: 'i',
      },
      version: 1,
    },
    {
      userId,
      name: 'Engagement bait',
      enabled: true,
      weight: 1,
      kind: 'regex',
      config: {
        pattern: '(like\\s+and\\s+subscribe|follow\\s+for\\s+more|dm\\s+me)',
        flags: 'i',
      },
      version: 1,
    },
    {
      userId,
      name: 'URL shorteners',
      enabled: true,
      weight: 2,
      kind: 'url-domain',
      config: { domains: ['bit.ly', 'tinyurl.com', 't.co'] },
      version: 1,
    },
    {
      userId,
      name: 'Very new account (≤1d)',
      enabled: true,
      weight: 3,
      kind: 'feature-threshold',
      config: { feature: 'account_age_days', op: 'lte', value: 1 },
      version: 1,
    },
    {
      userId,
      name: 'High prior strikes',
      enabled: true,
      weight: 4,
      kind: 'feature-threshold',
      config: { feature: 'prior_strikes', op: 'gte', value: 3 },
      version: 1,
    },
    {
      userId,
      name: 'Banned keyword (example)',
      enabled: false,
      weight: 10,
      kind: 'regex',
      config: { pattern: 'replace-this-pattern', flags: 'i' },
      version: 1,
    },
  ])
}
