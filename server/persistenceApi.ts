import { and, desc, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import OpenAI from 'openai'
import { z } from 'zod'
import { rechunkCorpusForDb } from './corpusRechunk.js'
import {
  embedPendingChunksForCorpus,
  scheduleEmbedAfterCorpusWrite,
} from './embedCorpusChunks.js'
import { getDb, getPool } from './db/client.js'
import { appendBlocksToBody, isAllowedIngestName } from './ingestServer.js'
import { corpora, graphs, runs, users, type SerializedGraphJson } from './db/schema.js'

const graphBody = z.object({
  name: z.string().min(1).max(200),
  data: z.object({
    version: z.literal(1),
    nodes: z.array(z.tuple([z.string(), z.unknown()])),
    edges: z.array(z.tuple([z.string(), z.unknown()])),
    selection: z.array(z.string()),
    edgeSelection: z.array(z.string()),
  }),
})

const corpusCreate = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200),
  body: z.string().max(65_536).default(''),
  chunkSize: z.number().int().min(10).max(8_000).optional(),
  chunkOverlap: z.number().int().min(0).max(4_000).optional(),
})

const corpusUpdate = z.object({
  name: z.string().min(1).max(200).optional(),
  body: z.string().max(65_536).optional(),
  chunkSize: z.number().int().min(10).max(8_000).optional(),
  chunkOverlap: z.number().int().min(0).max(4_000).optional(),
})

const retrieveBody = z.object({
  corpusId: z
    .string()
    .max(200)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'corpusId is required'),
  query: z
    .string()
    .max(4_000)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'query is required'),
  k: z.number().int().min(1).max(20).default(5),
  mode: z.enum(['cosine']),
})

const runBody = z.object({
  graphId: z.string().uuid().optional().nullable(),
  status: z.enum(['ok', 'error', 'cancelled']),
  summary: z.string().max(4_000).optional().nullable(),
  error: z.string().max(4_000).optional().nullable(),
})

function userId(c: Context): string {
  const clerkId = c.get('resolvedUserId')
  if (typeof clerkId === 'string' && clerkId.length > 0) {
    return clerkId
  }
  return c.req.header('x-user-id')?.trim() || 'dev'
}

function noDb() {
  return { error: 'Database not configured (set DATABASE_URL)' } as const
}

function vectorToPgLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`
}

export function createPersistenceApp(): Hono {
  const r = new Hono()

  r.get('/graphs', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const list = await db
      .select({
        id: graphs.id,
        name: graphs.name,
        isPublic: graphs.isPublic,
        createdAt: graphs.createdAt,
        updatedAt: graphs.updatedAt,
      })
      .from(graphs)
      .where(eq(graphs.userId, uid))
      .orderBy(desc(graphs.updatedAt))
    return c.json({ graphs: list })
  })

  r.post('/graphs', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = graphBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400)
    }
    const uid = userId(c)
    const [row] = await db
      .insert(graphs)
      .values({
        userId: uid,
        name: parsed.data.name,
        data: parsed.data.data as SerializedGraphJson,
      })
      .returning()
    return c.json({ graph: row }, 201)
  })

  r.get('/graphs/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const [row] = await db
      .select()
      .from(graphs)
      .where(and(eq(graphs.id, id), eq(graphs.userId, uid)))
    if (row == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json({ graph: row })
  })

  r.patch('/graphs/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const partial = z
      .object({ name: z.string().min(1).max(200).optional(), data: graphBody.shape.data.optional() })
      .safeParse(body)
    if (!partial.success) {
      return c.json({ error: partial.error.message }, 400)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const [cur] = await db
      .select()
      .from(graphs)
      .where(and(eq(graphs.id, id), eq(graphs.userId, uid)))
    if (cur == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    const [row] = await db
      .update(graphs)
      .set({
        name: partial.data.name ?? cur.name,
        data: (partial.data.data as SerializedGraphJson) ?? cur.data,
        updatedAt: new Date(),
      })
      .where(eq(graphs.id, id))
      .returning()
    return c.json({ graph: row! })
  })

  r.delete('/graphs/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const n = await db
      .delete(graphs)
      .where(and(eq(graphs.id, id), eq(graphs.userId, uid)))
      .returning({ id: graphs.id })
    if (n.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json({ ok: true })
  })

  r.get('/corpora', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const list = await db
      .select()
      .from(corpora)
      .where(eq(corpora.userId, uid))
      .orderBy(desc(corpora.updatedAt))
    return c.json({ corpora: list })
  })

  r.post('/corpora', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = corpusCreate.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400)
    }
    const uid = userId(c)
    const id =
      parsed.data.id ?? `corpus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const chunkSize = parsed.data.chunkSize ?? 800
    let chunkOverlap = parsed.data.chunkOverlap ?? 20
    if (chunkOverlap >= chunkSize) {
      chunkOverlap = Math.max(0, chunkSize - 1)
    }
    await db.insert(users).values({ id: uid }).onConflictDoNothing()
    const [exists] = await db
      .select()
      .from(corpora)
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
    if (exists != null) {
      return c.json({ error: 'Corpus id already exists' }, 409)
    }
    const [row] = await db
      .insert(corpora)
      .values({
        id,
        userId: uid,
        name: parsed.data.name,
        body: parsed.data.body,
        chunkSize,
        chunkOverlap,
      })
      .returning()
    await rechunkCorpusForDb(db, uid, id)
    scheduleEmbedAfterCorpusWrite(db, uid, id)
    return c.json({ corpus: row }, 201)
  })

  r.get('/corpora/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const [row] = await db
      .select()
      .from(corpora)
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
    if (row == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json({ corpus: row })
  })

  r.put('/corpora/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = corpusUpdate.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400)
    }
    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'Empty update' }, 400)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const [cur] = await db
      .select()
      .from(corpora)
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
    if (cur == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    const chunkSize = parsed.data.chunkSize ?? cur.chunkSize
    let chunkOverlap = parsed.data.chunkOverlap ?? cur.chunkOverlap
    if (chunkOverlap >= chunkSize) {
      chunkOverlap = Math.max(0, chunkSize - 1)
    }
    const [row] = await db
      .update(corpora)
      .set({
        name: parsed.data.name ?? cur.name,
        body: parsed.data.body ?? cur.body,
        chunkSize,
        chunkOverlap,
        updatedAt: new Date(),
      })
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
      .returning()
    if (row == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    await rechunkCorpusForDb(db, uid, id)
    scheduleEmbedAfterCorpusWrite(db, uid, id)
    return c.json({ corpus: row })
  })

  r.delete('/corpora/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    if (id === 'corpus-default') {
      return c.json({ error: 'Cannot delete default corpus' }, 400)
    }
    const n = await db
      .delete(corpora)
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
      .returning({ id: corpora.id })
    if (n.length === 0) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json({ ok: true })
  })

  r.post('/corpora/:id/documents', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const [cur] = await db
      .select()
      .from(corpora)
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
    if (cur == null) {
      return c.json({ error: 'Not found' }, 404)
    }
    const form = await c.req.parseBody()
    const rawFiles: unknown = form['files'] ?? form['file']
    const fileList: File[] = Array.isArray(rawFiles)
      ? (rawFiles as File[]).filter((f) => f instanceof File)
      : rawFiles instanceof File
        ? [rawFiles]
        : []
    const added: { title: string; body: string }[] = []
    for (const f of fileList) {
      if (!isAllowedIngestName(f.name)) {
        continue
      }
      const text = await f.text()
      added.push({ title: f.name, body: text })
    }
    if (added.length === 0) {
      return c.json({ error: 'No allowed files (.md, .txt, .json)' }, 400)
    }
    const merged = appendBlocksToBody(cur.body, added, 65_536)
    if (merged.error != null) {
      return c.json({ error: merged.error }, 400)
    }
    const [row] = await db
      .update(corpora)
      .set({ body: merged.body, updatedAt: new Date() })
      .where(and(eq(corpora.id, id), eq(corpora.userId, uid)))
      .returning()
    await rechunkCorpusForDb(db, uid, id)
    scheduleEmbedAfterCorpusWrite(db, uid, id)
    return c.json({ corpus: row, appended: added.length }, 201)
  })

  r.post('/corpora/:id/embed', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const out = await embedPendingChunksForCorpus(db, uid, id)
    if (out.skipped === 'not-found') {
      return c.json({ error: 'Not found' }, 404)
    }
    if (out.skipped === 'no-key') {
      return c.json({ error: 'OPENAI_API_KEY is not set' }, 503)
    }
    if (out.embedded === 0) {
      return c.json({ embedded: 0, message: 'Nothing to embed' }, 200)
    }
    return c.json({ embedded: out.embedded })
  })

  r.post('/retrieve', async (c) => {
    try {
      const db = getDb()
      const pool = getPool()
      if (db == null || pool == null) {
        return c.json(noDb(), 503)
      }
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400)
      }
      const parsed = retrieveBody.safeParse(body)
      if (!parsed.success) {
        return c.json({ error: parsed.error.message }, 400)
      }
      if (parsed.data.mode !== 'cosine') {
        return c.json({ error: 'Server retrieve supports cosine only' }, 400)
      }
      const uid = userId(c)
      const { corpusId, query, k } = parsed.data
      await db.insert(users).values({ id: uid }).onConflictDoNothing()
      const [co] = await db
        .select()
        .from(corpora)
        .where(and(eq(corpora.id, corpusId), eq(corpora.userId, uid)))
      if (co == null) {
        return c.json(
          {
            code: 'corpus_not_found',
            error:
              `No corpus "${corpusId}" for this signed-in user. Create it via corpus sync (build with VITE_SYNC_SERVER=1 and save), or POST /api/corpora, then embed chunks (OPENAI_API_KEY / POST .../embed). List ids with GET /api/corpora. Match the AppRetrieve node's corpus id.`,
            corpusId,
          },
          422,
        )
      }
      const key = process.env.OPENAI_API_KEY
      if (!key || key.length === 0) {
        return c.json({ error: 'OPENAI_API_KEY is not set' }, 503)
      }
      const openai = new OpenAI({ apiKey: key })
      const model = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
      let qe
      try {
        qe = await openai.embeddings.create({ model, input: [query] })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[flow-prompt-studio] OpenAI embed query', e)
        return c.json({ error: `Query embedding failed: ${msg}` }, 502)
      }
      const qv = qe.data[0]!.embedding as number[]
      const vlit = vectorToPgLiteral(qv)
      const q = `
      SELECT
        ch.content,
        ch.source,
        ch.part_index AS "partIndex",
        d.title AS "docTitle",
        1 - (ch.embedding <=> $1::vector) AS score
      FROM chunks ch
      INNER JOIN documents d ON d.id = ch.document_id
      INNER JOIN corpora co ON co.user_id = d.corpus_user_id AND co.id = d.corpus_id
      WHERE co.id = $2 AND co.user_id = $3
        AND ch.embedding IS NOT NULL
      ORDER BY ch.embedding <=> $1::vector
      LIMIT $4
    `
      let res
      try {
        res = await pool.query<{
          content: string
          source: string
          partIndex: number
          docTitle: string
          score: string
        }>(q, [vlit, corpusId, uid, k])
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[flow-prompt-studio] pg retrieve', e)
        return c.json(
          {
            error: `Database query failed: ${msg}. If you use Supabase, set DATABASE_URL to the Direct connection (db.*.supabase.co:5432), not the transaction pooler (:6543).`,
          },
          500,
        )
      }
      if (res.rows.length === 0) {
        const heal = await embedPendingChunksForCorpus(db, uid, corpusId)
        if (heal.embedded > 0) {
          try {
            res = await pool.query<{
              content: string
              source: string
              partIndex: number
              docTitle: string
              score: string
            }>(q, [vlit, corpusId, uid, k])
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error('[flow-prompt-studio] pg retrieve (after heal)', e)
            return c.json(
              {
                error: `Database query failed: ${msg}. If you use Supabase, use the Direct connection string.`,
              },
              500,
            )
          }
        }
      }
      if (res.rows.length === 0) {
        return c.json(
          {
            error:
              'No embedded chunks for this corpus. The server tried to embed pending chunks inline and still found none — make sure the corpus has documents saved (POST /api/corpora/:id or /documents) and OPENAI_API_KEY is set on the API. You can also set VITE_COSINE_CLIENT_FALLBACK=1 to allow in-browser cosine (IndexedDB).',
          },
          400,
        )
      }
      const rows = res.rows.map((r) => ({
        text: r.content,
        source: r.source,
        docTitle: r.docTitle,
        partIndex: r.partIndex,
        score: Number.parseFloat(r.score),
      }))
      return c.json({ rows, fallbackNote: null as string | null })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[flow-prompt-studio] POST /api/retrieve', e)
      return c.json({ error: msg }, 500)
    }
  })

  r.post('/runs', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = runBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400)
    }
    const uid = userId(c)
    const [row] = await db
      .insert(runs)
      .values({
        userId: uid,
        graphId: parsed.data.graphId ?? null,
        status: parsed.data.status,
        finishedAt: new Date(),
        summary: parsed.data.summary ?? null,
        error: parsed.data.error ?? null,
      })
      .returning()
    return c.json({ run: row }, 201)
  })

  return r
}
