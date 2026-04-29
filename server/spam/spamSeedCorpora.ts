import { and, eq, isNull, or } from 'drizzle-orm'
import { rechunkCorpusForDb } from '../corpusRechunk.js'
import { embedPendingChunksForCorpus } from '../embedCorpusChunks.js'
import { corpora, spamCategories } from '../db/schema.js'
import type { SpamDb } from './spamBaselineRules.js'

export const SPAM_EXAMPLES_CORPUS_ID = 'spam-examples'
export const SPAM_POLICY_CORPUS_ID = 'spam-policy'

const EXAMPLES_BODY = `---
title: Known spam pattern A
---

KNOWN_SPAM_CASE_ALPHA: Example of unsolicited crypto pump messaging with an urgent call-to-action.

---
title: Known spam pattern B
---

KNOWN_SPAM_CASE_BETA: Engagement bait asking users to reply with contact info or off-platform links.
`

const POLICY_BODY = `# Platform policy (seed)

POLICY_VIOLATION_PHRASE: Commercial spam, phishing, impersonation, and unsolicited bulk promotion are prohibited.

Users must not post deceptive links. Staff will never ask for passwords or seed phrases in chat.
`

/**
 * Ensures example + policy corpora exist, are chunked & embedded (when OPENAI_API_KEY is set),
 * and links the default spam category to them.
 */
export async function ensureSpamSeedCorpora(db: SpamDb, userId: string): Promise<void> {
  const catId = `cat:${userId}:general`

  const [existingEx] = await db
    .select({ id: corpora.id })
    .from(corpora)
    .where(and(eq(corpora.userId, userId), eq(corpora.id, SPAM_EXAMPLES_CORPUS_ID)))
    .limit(1)

  if (existingEx == null) {
    await db.insert(corpora).values({
      userId,
      id: SPAM_EXAMPLES_CORPUS_ID,
      name: 'Spam examples (seed)',
      body: EXAMPLES_BODY,
      chunkSize: 800,
      chunkOverlap: 20,
    })
    await rechunkCorpusForDb(db, userId, SPAM_EXAMPLES_CORPUS_ID)
    await embedPendingChunksForCorpus(db, userId, SPAM_EXAMPLES_CORPUS_ID)
  }

  const [existingPol] = await db
    .select({ id: corpora.id })
    .from(corpora)
    .where(and(eq(corpora.userId, userId), eq(corpora.id, SPAM_POLICY_CORPUS_ID)))
    .limit(1)

  if (existingPol == null) {
    await db.insert(corpora).values({
      userId,
      id: SPAM_POLICY_CORPUS_ID,
      name: 'Spam policy (seed)',
      body: POLICY_BODY,
      chunkSize: 800,
      chunkOverlap: 20,
    })
    await rechunkCorpusForDb(db, userId, SPAM_POLICY_CORPUS_ID)
    await embedPendingChunksForCorpus(db, userId, SPAM_POLICY_CORPUS_ID)
  }

  await db
    .update(spamCategories)
    .set({
      corpusUserId: userId,
      corpusId: SPAM_EXAMPLES_CORPUS_ID,
      policyCorpusUserId: userId,
      policyCorpusId: SPAM_POLICY_CORPUS_ID,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(spamCategories.id, catId),
        eq(spamCategories.userId, userId),
        or(isNull(spamCategories.corpusId), isNull(spamCategories.policyCorpusId)),
      ),
    )
}
