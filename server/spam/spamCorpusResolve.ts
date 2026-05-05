import { and, eq } from 'drizzle-orm'
import { spamCategories } from '../db/schema.js'
import type { SpamDb } from './spamBaselineRules.js'
import {
  SPAM_EXAMPLES_CORPUS_ID,
  SPAM_POLICY_CORPUS_ID,
} from './spamSeedCorpora.js'

export async function resolveSpamExampleCorpus(
  db: SpamDb,
  userId: string,
  categoryId: string | null | undefined,
): Promise<{ corpusUserId: string; corpusId: string }> {
  const cid = categoryId?.trim()
  if (!cid) {
    return { corpusUserId: userId, corpusId: SPAM_EXAMPLES_CORPUS_ID }
  }
  const catRows = await db
    .select({
      corpusUserId: spamCategories.corpusUserId,
      corpusId: spamCategories.corpusId,
    })
    .from(spamCategories)
    .where(and(eq(spamCategories.id, cid), eq(spamCategories.userId, userId)))
    .limit(1)
  if (catRows.length === 0) {
    return { corpusUserId: userId, corpusId: SPAM_EXAMPLES_CORPUS_ID }
  }
  const row = catRows[0]!
  return {
    corpusUserId: row.corpusUserId ?? userId,
    corpusId: row.corpusId ?? SPAM_EXAMPLES_CORPUS_ID,
  }
}

export async function resolveSpamPolicyCorpus(
  db: SpamDb,
  userId: string,
  categoryId: string | null | undefined,
): Promise<{ corpusUserId: string; corpusId: string }> {
  const cid = categoryId?.trim()
  if (!cid) {
    return { corpusUserId: userId, corpusId: SPAM_POLICY_CORPUS_ID }
  }
  const catRows = await db
    .select({
      policyCorpusUserId: spamCategories.policyCorpusUserId,
      policyCorpusId: spamCategories.policyCorpusId,
    })
    .from(spamCategories)
    .where(and(eq(spamCategories.id, cid), eq(spamCategories.userId, userId)))
    .limit(1)
  if (catRows.length === 0) {
    return { corpusUserId: userId, corpusId: SPAM_POLICY_CORPUS_ID }
  }
  const row = catRows[0]!
  return {
    corpusUserId: row.policyCorpusUserId ?? userId,
    corpusId: row.policyCorpusId ?? SPAM_POLICY_CORPUS_ID,
  }
}
