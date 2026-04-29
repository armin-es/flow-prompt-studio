import { describe, expect, it } from 'vitest'
import {
  deriveStatusAfterRules,
  evaluateSpamRules,
  extractUrlHosts,
  SPAM_TAU_ALLOW,
  SPAM_TAU_QUARANTINE,
} from './spamRulesEngine.js'

describe('extractUrlHosts', () => {
  it('collects hosts from URLs', () => {
    expect(extractUrlHosts('see https://bit.ly/x and http://EXAMPLE.com/path')).toEqual([
      'bit.ly',
      'example.com',
    ])
  })
})

describe('evaluateSpamRules', () => {
  it('scores regex once when matched', () => {
    const rules = [
      {
        id: 'r1',
        name: 'test',
        enabled: true,
        weight: 2,
        kind: 'regex',
        config: { pattern: 'spam', flags: 'i' },
      },
    ]
    const { score, matches } = evaluateSpamRules('this is SPAM', {}, rules)
    expect(score).toBe(2)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.contribution).toBe(2)
  })

  it('sums per-match regex contributions', () => {
    const rules = [
      {
        id: 'r1',
        name: 'links',
        enabled: true,
        weight: 1,
        kind: 'regex',
        config: {
          pattern: String.raw`https?:\/\/[^\s]+`,
          flags: 'gi',
          perMatch: true,
          maxMatches: 3,
        },
      },
    ]
    const { score } = evaluateSpamRules('a https://a.com b https://b.com', {}, rules)
    expect(score).toBe(2)
  })

  it('matches url-domain blocklist', () => {
    const rules = [
      {
        id: 'r1',
        name: 'short',
        enabled: true,
        weight: 5,
        kind: 'url-domain',
        config: { domains: ['bit.ly'] },
      },
    ]
    const { score } = evaluateSpamRules('click https://bit.ly/x ok', {}, rules)
    expect(score).toBe(5)
  })

  it('evaluates feature thresholds with missing feature as 0', () => {
    const rules = [
      {
        id: 'r1',
        name: 'newacct',
        enabled: true,
        weight: 3,
        kind: 'feature-threshold',
        config: { feature: 'account_age_days', op: 'lte', value: 1 },
      },
    ]
    const { score } = evaluateSpamRules('hello', {}, rules)
    expect(score).toBe(3)
  })
})

describe('deriveStatusAfterRules', () => {
  it('maps thresholds', () => {
    expect(deriveStatusAfterRules(SPAM_TAU_ALLOW)).toBe('allowed')
    expect(deriveStatusAfterRules(SPAM_TAU_ALLOW + 0.1)).toBe('queued')
    expect(deriveStatusAfterRules(SPAM_TAU_QUARANTINE)).toBe('quarantined')
  })
})
