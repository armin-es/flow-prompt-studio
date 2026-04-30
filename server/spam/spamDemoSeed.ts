/** Shape matches `POST /api/spam/items` JSON (used only for demo seeding). */
export type SpamDemoIngestPayload = {
  source: string
  body: string
  externalId: string
  authorFeatures?: Record<string, unknown>
  categoryId?: string | null
}

/**
 * Idempotent demo posts: skipped if `user_id` + `external_id` already exists.
 * Ingest runs Stage A on insert; Stage B is queued async for `queued` / `quarantined`.
 */
export const SPAM_DEMO_FIXTURES: SpamDemoIngestPayload[] = [
  {
    source: 'demo',
    externalId: 'demo:ham-thanks',
    body: 'Really useful write-up — thanks for posting.',
    authorFeatures: { account_age_days: 800, prior_strikes: 0 },
  },
  {
    source: 'demo',
    externalId: 'demo:spam-crypto',
    body:
      'HUGE crypto GIVEAWAY verify your wallet dm me your seed phrase bonus https://bit.ly/free-coins-now',
    authorFeatures: { account_age_days: 0, prior_strikes: 3 },
  },
  {
    source: 'demo',
    externalId: 'demo:spam-bait',
    body: 'Like and subscribe for more!!! DM me for the full list tinyurl.com/x123',
    authorFeatures: { account_age_days: 5, prior_strikes: 0 },
  },
  {
    source: 'demo',
    externalId: 'demo:borderline',
    body: 'Hey, thought this link might help: https://example.com/guide — lmk what you think.',
    authorFeatures: { account_age_days: 30, prior_strikes: 0 },
  },
]
