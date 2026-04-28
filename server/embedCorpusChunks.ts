import { and, eq, sql } from 'drizzle-orm'
import OpenAI from 'openai'
import type { Db } from './db/client.js'
import { chunks, corpora, documents } from './db/schema.js'

const EMBED_BATCH = 32

/**
 * Embeds all chunks for a corpus that have `embedding IS NULL`. No-op if no API key.
 * Used by `POST /api/corpora/:id/embed` and after corpus write (background).
 */
export async function embedPendingChunksForCorpus(
  db: Db,
  userId: string,
  corpusId: string,
): Promise<{ embedded: number; skipped?: 'no-key' | 'not-found' }> {
  const key = process.env.OPENAI_API_KEY
  if (!key || key.length === 0) {
    return { embedded: 0, skipped: 'no-key' }
  }
  const [co] = await db
    .select()
    .from(corpora)
    .where(and(eq(corpora.id, corpusId), eq(corpora.userId, userId)))
  if (co == null) {
    return { embedded: 0, skipped: 'not-found' }
  }
  const openai = new OpenAI({ apiKey: key })
  const model = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
  const pending = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(
      and(
        eq(documents.corpusId, corpusId),
        eq(documents.corpusUserId, userId),
        sql`${chunks.embedding} IS NULL`,
      ),
    )
  if (pending.length === 0) {
    return { embedded: 0 }
  }
  let count = 0
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH)
    const inputs = batch.map((b) => b.content)
    const res = await openai.embeddings.create({ model, input: inputs })
    const sorted = [...res.data].sort((a, b) => a.index - b.index)
    for (let j = 0; j < batch.length; j++) {
      const v = sorted[j]!.embedding as number[]
      const cid = batch[j]!.id
      await db
        .update(chunks)
        .set({ embedding: v })
        .where(eq(chunks.id, cid))
      count += 1
    }
  }
  return { embedded: count }
}

/** Fire-and-forget embed after corpus text changes; skip if `SKIP_AUTO_EMBED=1`. */
export function scheduleEmbedAfterCorpusWrite(
  db: Db,
  userId: string,
  corpusId: string,
): void {
  if (process.env.SKIP_AUTO_EMBED === '1') {
    return
  }
  void Promise.resolve()
    .then(() => embedPendingChunksForCorpus(db, userId, corpusId))
    .then((r) => {
      if (r.embedded > 0) {
        console.log(
          `[flow-prompt-studio] auto-embedded ${r.embedded} chunk(s) for corpus ${corpusId}`,
        )
      }
    })
    .catch((e: unknown) => {
      console.error(
        `[flow-prompt-studio] auto-embed failed for corpus ${corpusId}`,
        e,
      )
    })
}
