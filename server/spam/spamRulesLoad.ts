import { and, eq, sql as dsql } from 'drizzle-orm'
import { spamCategories, spamRules, users } from '../db/schema.js'
import type { SpamDb } from './spamBaselineRules.js'
import { ensureBaselineSpamRules } from './spamBaselineRules.js'
import type { SpamRuleRow } from './spamRulesEngine.js'

function defaultCategoryId(uid: string): string {
  return `cat:${uid}:general`
}

/** Ensure user row, default spam category, and baseline rules (same as /api/spam/evaluate prerequisites). */
export async function ensureSpamEvalUser(db: SpamDb, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing()
  const cid = defaultCategoryId(userId)
  await db
    .insert(spamCategories)
    .values({
      id: cid,
      userId,
      name: 'General',
      description: 'Default triage category',
      updatedAt: dsql`now()`,
    })
    .onConflictDoNothing()
  await ensureBaselineSpamRules(db, userId)
}

export async function loadSpamRulesForEvaluation(
  db: SpamDb,
  userId: string,
): Promise<SpamRuleRow[]> {
  await ensureSpamEvalUser(db, userId)
  const ruleRows = await db
    .select({
      id: spamRules.id,
      name: spamRules.name,
      enabled: spamRules.enabled,
      weight: spamRules.weight,
      kind: spamRules.kind,
      config: spamRules.config,
    })
    .from(spamRules)
    .where(and(eq(spamRules.userId, userId)))
  return ruleRows as SpamRuleRow[]
}
