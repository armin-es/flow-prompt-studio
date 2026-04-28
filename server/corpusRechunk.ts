import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { chunkCorpus, type TextChunk } from '../src/engine/retrieve/chunk.js'
import type { Db } from './db/client.js'
import { chunks, corpora, documents } from './db/schema.js'

const DELIM = '\n\n---\n\n'

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Rebuilds `documents` and `chunks` (embeddings cleared) for a corpus from
 * `corpora.body` using the same `chunkCorpus` logic as the client.
 */
export async function rechunkCorpusForDb(
  db: Db,
  userId: string,
  corpusId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(corpora)
    .where(and(eq(corpora.id, corpusId), eq(corpora.userId, userId)))
  if (row == null) {
    throw new Error('Corpus not found')
  }
  const body = row.body
  const chunkSize = row.chunkSize
  const chunkOverlap = row.chunkOverlap
  if (chunkSize < 1) {
    throw new Error('Invalid chunk size')
  }

  const textChunks: TextChunk[] = chunkCorpus(body, { chunkSize, chunkOverlap })
  const rawDocs = body.split(DELIM).map((d) => d.trim()).filter(Boolean)
  if (rawDocs.length === 0) {
    await db
      .delete(documents)
      .where(and(eq(documents.corpusId, corpusId), eq(documents.corpusUserId, userId)))
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(documents)
      .where(and(eq(documents.corpusId, corpusId), eq(documents.corpusUserId, userId)))

    const docIdToRowId = new Map<string, string>()
    for (let d = 0; d < rawDocs.length; d++) {
      const b = rawDocs[d]!
      const firstPara = b.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0)[0]
      const title =
        firstPara != null
          ? firstPara.replace(/^#+\s*/, '').trim().slice(0, 200) || `Document ${d + 1}`
          : `Document ${d + 1}`
      const key = `doc-${d + 1}` as const
      const h = sha256(b)
      const [ins] = await tx
        .insert(documents)
        .values({
          corpusUserId: userId,
          corpusId,
          title,
          sha256: h,
          body: b,
        })
        .returning({ id: documents.id })
      docIdToRowId.set(key, ins!.id)
    }

    for (const ch of textChunks) {
      const did = docIdToRowId.get(ch.docId)
      if (did == null) {
        continue
      }
      await tx.insert(chunks).values({
        documentId: did,
        paragraphIndex: ch.firstParagraphIndex,
        partIndex: ch.partIndex,
        source: ch.source,
        content: ch.text,
        embedding: null,
      })
    }
  })
}
