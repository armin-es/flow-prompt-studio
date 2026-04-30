import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, inArray, sql as dsql } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../db/client.js'
import {
  graphs,
  spamCategories,
  spamDecisions,
  spamItems,
  spamRules,
  runs,
  users,
  type SerializedGraphJson,
} from '../db/schema.js'
import { ensureBaselineSpamRules } from './spamBaselineRules.js'
import {
  deriveStatusAfterRules,
  evaluateSpamRules,
  type SpamRuleRow,
} from './spamRulesEngine.js'
import { SPAM_DEMO_FIXTURES } from './spamDemoSeed.js'
import {
  ensureSpamDefaultGraphForApi,
  queueSpamStageB,
  runSpamStageB,
} from './spamStageB.js'

const ingestBody = z.object({
  source: z.string().min(1).max(200),
  body: z.string().min(1).max(65_536),
  externalId: z.string().max(500).optional().nullable(),
  authorFeatures: z.record(z.unknown()).optional(),
  categoryId: z.string().max(200).optional().nullable(),
})

const statusEnum = z.enum([
  'new',
  'allowed',
  'quarantined',
  'queued',
  'decided',
  'dropped',
])

const listQuery = z.object({
  status: statusEnum.optional(),
  /** Use `?all=1` to include allowed/decided/dropped; default lists triage (`new`, `queued`, `quarantined`). */
  all: z
    .string()
    .optional()
    .transform((s): boolean => s === '1' || s === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

const evaluateBody = z.object({
  body: z.string().min(1).max(65_536),
  authorFeatures: z.record(z.unknown()).optional(),
})

const decisionBody = z.object({
  action: z.enum(['allow', 'shadow', 'quarantine', 'remove', 'escalate']),
  rationale: z.string().max(4000).optional().nullable(),
  categoryId: z.string().max(200).optional().nullable(),
  agreedWithLlm: z.boolean().optional(),
})

const createRuleBody = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional().default(true),
  weight: z.number().finite().min(0.01).max(100),
  kind: z.enum(['regex', 'url-domain', 'feature-threshold']),
  config: z.record(z.unknown()),
})

const patchRuleBody = z.object({
  enabled: z.boolean().optional(),
  weight: z.number().finite().min(0.01).max(100).optional(),
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

function defaultCategoryId(uid: string): string {
  return `cat:${uid}:general`
}

async function ensureUserCategoryAndRules(
  db: NonNullable<ReturnType<typeof getDb>>,
  uid: string,
): Promise<void> {
  await db.insert(users).values({ id: uid }).onConflictDoNothing()
  const cid = defaultCategoryId(uid)
  await db
    .insert(spamCategories)
    .values({
      id: cid,
      userId: uid,
      name: 'General',
      description: 'Default triage category',
      updatedAt: dsql`now()`,
    })
    .onConflictDoNothing()
  await ensureBaselineSpamRules(db, uid)
}

async function resolveCategoryId(
  db: NonNullable<ReturnType<typeof getDb>>,
  uid: string,
  requested: string | undefined | null,
): Promise<string> {
  await ensureUserCategoryAndRules(db, uid)
  const fallback = defaultCategoryId(uid)
  const raw = requested?.trim()
  if (!raw) return fallback
  const found = await db
    .select({ id: spamCategories.id })
    .from(spamCategories)
    .where(and(eq(spamCategories.id, raw), eq(spamCategories.userId, uid)))
    .limit(1)
  return found.length > 0 ? raw : fallback
}

function verifyHmac(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header || !header.startsWith('sha256=')) {
    return false
  }
  const got = header.slice('sha256='.length).trim()
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  try {
    const a = Buffer.from(got, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function reviewerAllowed(uid: string): boolean {
  const raw = process.env.SPAM_REVIEWER_USER_IDS?.trim()
  if (!raw) return true
  const ids = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  return ids.includes(uid)
}

async function scoreSpamItemById(
  db: NonNullable<ReturnType<typeof getDb>>,
  uid: string,
  itemId: string,
): Promise<void> {
  const [item] = await db
    .select({
      body: spamItems.body,
      authorFeatures: spamItems.authorFeatures,
    })
    .from(spamItems)
    .where(and(eq(spamItems.id, itemId), eq(spamItems.userId, uid)))
    .limit(1)
  if (!item) return

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
    .where(and(eq(spamRules.userId, uid)))

  const features =
    typeof item.authorFeatures === 'object' &&
    item.authorFeatures != null &&
    !Array.isArray(item.authorFeatures)
      ? (item.authorFeatures as Record<string, unknown>)
      : {}

  const evalRules = ruleRows as SpamRuleRow[]
  const { score } = evaluateSpamRules(item.body, features, evalRules)
  const nextStatus = deriveStatusAfterRules(score)

  await db
    .update(spamItems)
    .set({
      ruleScore: score,
      scoredAt: dsql`now()`,
      status: nextStatus,
    })
    .where(and(eq(spamItems.id, itemId), eq(spamItems.userId, uid)))
}

async function ingestSpamItemFromPayload(
  db: NonNullable<ReturnType<typeof getDb>>,
  uid: string,
  d: z.infer<typeof ingestBody>,
): Promise<{ id: string; status: string }> {
  const categoryId = await resolveCategoryId(db, uid, d.categoryId)

  const [row] = await db
    .insert(spamItems)
    .values({
      userId: uid,
      source: d.source,
      body: d.body,
      externalId: d.externalId ?? null,
      authorFeatures: d.authorFeatures ?? {},
      categoryId,
      status: 'new',
    })
    .returning({ id: spamItems.id })

  try {
    await scoreSpamItemById(db, uid, row!.id)
  } catch (e) {
    console.error('[spam] scoreSpamItemById failed', e)
  }

  const [after] = await db
    .select({ id: spamItems.id, status: spamItems.status })
    .from(spamItems)
    .where(eq(spamItems.id, row!.id))
    .limit(1)

  if (after!.status === 'queued' || after!.status === 'quarantined') {
    queueSpamStageB(uid, after!.id)
  }

  return { id: after!.id, status: after!.status }
}

export function createSpamApp(): Hono {
  const r = new Hono()

  /**
   * Returns the UUID of the saved `spam-default` graph (creating it on first use).
   * The client uses this to load the graph into the studio and to PATCH it back.
   */
  r.get('/pipeline', async (c) => {
    const db = getDb()
    if (db == null) return c.json(noDb(), 503)
    const uid = userId(c)
    await ensureUserCategoryAndRules(db, uid)
    const found = await db
      .select({ id: graphs.id })
      .from(graphs)
      .where(and(eq(graphs.userId, uid), eq(graphs.name, 'spam-default')))
      .limit(1)
    if (found.length > 0) {
      return c.json({ graphId: found[0]!.id })
    }
    const graphId = await ensureSpamDefaultGraphForApi(db, uid)
    return c.json({ graphId })
  })

  /**
   * Overwrites the `spam-default` graph data (called "Publish spam policy" in the studio toolbar).
   * Stage B on the *next* ingest will read the new LLM prompt from this graph.
   */
  r.patch('/pipeline', async (c) => {
    const db = getDb()
    if (db == null) return c.json(noDb(), 503)
    const uid = userId(c)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
    const parsed = z.object({
      data: z.object({
        version: z.literal(1),
        nodes: z.array(z.tuple([z.string(), z.unknown()])),
        edges: z.array(z.tuple([z.string(), z.unknown()])),
        selection: z.array(z.string()),
        edgeSelection: z.array(z.string()),
      }),
    }).safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400)

    const [existing] = await db
      .select({ id: graphs.id })
      .from(graphs)
      .where(and(eq(graphs.userId, uid), eq(graphs.name, 'spam-default')))
      .limit(1)

    if (existing) {
      await db.update(graphs).set({ data: parsed.data.data as SerializedGraphJson, updatedAt: new Date() }).where(eq(graphs.id, existing.id))
      return c.json({ ok: true, graphId: existing.id })
    }
    // create if absent
    const [row] = await db.insert(graphs).values({ userId: uid, name: 'spam-default', data: parsed.data.data as SerializedGraphJson, isPublic: false }).returning({ id: graphs.id })
    return c.json({ ok: true, graphId: row!.id })
  })

  r.post('/evaluate', async (c) => {
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
    const parsed = evaluateBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const uid = userId(c)
    await ensureUserCategoryAndRules(db, uid)

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
      .where(and(eq(spamRules.userId, uid)))

    const features = parsed.data.authorFeatures ?? {}
    const { score, matches } = evaluateSpamRules(
      parsed.data.body,
      features,
      ruleRows as SpamRuleRow[],
    )
    const derivedStatus = deriveStatusAfterRules(score)
    return c.json({ score, matches, derivedStatus })
  })

  r.get('/rules', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    await ensureUserCategoryAndRules(db, uid)

    const rows = await db
      .select({
        id: spamRules.id,
        name: spamRules.name,
        enabled: spamRules.enabled,
        weight: spamRules.weight,
        kind: spamRules.kind,
        config: spamRules.config,
        version: spamRules.version,
        createdAt: spamRules.createdAt,
      })
      .from(spamRules)
      .where(eq(spamRules.userId, uid))
      .orderBy(desc(spamRules.createdAt))

    return c.json({ rules: rows })
  })

  r.post('/rules', async (c) => {
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
    const parsed = createRuleBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const uid = userId(c)
    await ensureUserCategoryAndRules(db, uid)

    const [row] = await db
      .insert(spamRules)
      .values({
        userId: uid,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        weight: parsed.data.weight,
        kind: parsed.data.kind,
        config: parsed.data.config,
      })
      .returning({ id: spamRules.id })

    return c.json({ id: row!.id })
  })

  r.patch('/rules/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const id = c.req.param('id')
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = patchRuleBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const uid = userId(c)

    const [existing] = await db
      .select({ id: spamRules.id })
      .from(spamRules)
      .where(and(eq(spamRules.id, id), eq(spamRules.userId, uid)))
      .limit(1)
    if (!existing) {
      return c.json({ error: 'not found' }, 404)
    }

    const patch: Partial<{ enabled: boolean; weight: number }> = {}
    if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled
    if (parsed.data.weight !== undefined) patch.weight = parsed.data.weight
    if (Object.keys(patch).length === 0) {
      return c.json({ error: 'no updates' }, 400)
    }

    await db.update(spamRules).set(patch).where(eq(spamRules.id, id))
    return c.json({ ok: true })
  })

  r.post('/items', async (c) => {
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
    const parsed = ingestBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const uid = userId(c)
    const out = await ingestSpamItemFromPayload(db, uid, parsed.data)
    return c.json(out)
  })

  /** Idempotent demo queue: inserts fixtures not already present (`user_id` + `external_id`). */
  r.post('/demo/seed', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    await ensureUserCategoryAndRules(db, uid)

    const inserted: Array<{ externalId: string; id: string; status: string }> = []
    const skipped: string[] = []

    for (const raw of SPAM_DEMO_FIXTURES) {
      const parsed = ingestBody.safeParse({
        ...raw,
        categoryId: raw.categoryId ?? null,
      })
      if (!parsed.success) {
        continue
      }
      const ext = parsed.data.externalId
      if (ext) {
        const [dup] = await db
          .select({ id: spamItems.id })
          .from(spamItems)
          .where(and(eq(spamItems.userId, uid), eq(spamItems.externalId, ext)))
          .limit(1)
        if (dup) {
          skipped.push(ext)
          continue
        }
      }
      const out = await ingestSpamItemFromPayload(db, uid, parsed.data)
      inserted.push({ externalId: ext ?? out.id, id: out.id, status: out.status })
    }

    return c.json({ ok: true, inserted, skipped })
  })

  r.get('/items', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const q = listQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
    if (!q.success) {
      return c.json({ error: q.error.flatten() }, 400)
    }
    const uid = userId(c)
    const triageStatuses = ['new', 'queued', 'quarantined'] as const

    const cond =
      q.data.status != null
        ? and(eq(spamItems.userId, uid), eq(spamItems.status, q.data.status))
        : q.data.all
          ? eq(spamItems.userId, uid)
          : and(eq(spamItems.userId, uid), inArray(spamItems.status, [...triageStatuses]))

    const rows = await db
      .select({
        id: spamItems.id,
        source: spamItems.source,
        externalId: spamItems.externalId,
        body: spamItems.body,
        status: spamItems.status,
        ruleScore: spamItems.ruleScore,
        llmScore: spamItems.llmScore,
        finalAction: spamItems.finalAction,
        runId: spamItems.runId,
        categoryId: spamItems.categoryId,
        createdAt: spamItems.createdAt,
      })
      .from(spamItems)
      .where(cond)
      .orderBy(desc(spamItems.createdAt))
      .limit(q.data.limit)

    return c.json({ items: rows })
  })

  r.post('/items/:id/score', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')
    const out = await runSpamStageB(db, uid, id)
    if (!out.ok) {
      return c.json({ error: out.error }, 400)
    }
    return c.json(out)
  })

  r.get('/items/:id', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const id = c.req.param('id')

    const [item] = await db
      .select({
        id: spamItems.id,
        source: spamItems.source,
        externalId: spamItems.externalId,
        body: spamItems.body,
        authorFeatures: spamItems.authorFeatures,
        status: spamItems.status,
        ruleScore: spamItems.ruleScore,
        llmScore: spamItems.llmScore,
        finalAction: spamItems.finalAction,
        categoryId: spamItems.categoryId,
        createdAt: spamItems.createdAt,
        scoredAt: spamItems.scoredAt,
        decidedAt: spamItems.decidedAt,
        runId: spamItems.runId,
      })
      .from(spamItems)
      .where(and(eq(spamItems.id, id), eq(spamItems.userId, uid)))
      .limit(1)

    if (!item) {
      return c.json({ error: 'not found' }, 404)
    }

    let stageB: unknown = null
    if (item.runId != null) {
      const [rw] = await db
        .select({ summary: runs.summary })
        .from(runs)
        .where(eq(runs.id, item.runId))
        .limit(1)
      const raw = rw?.summary
      if (raw != null && raw.length > 0) {
        try {
          stageB = JSON.parse(raw) as unknown
        } catch {
          stageB = raw
        }
      }
    }

    const decisions = await db
      .select({
        id: spamDecisions.id,
        reviewerId: spamDecisions.reviewerId,
        action: spamDecisions.action,
        categoryId: spamDecisions.categoryId,
        rationale: spamDecisions.rationale,
        policyQuote: spamDecisions.policyQuote,
        agreedWithLlm: spamDecisions.agreedWithLlm,
        createdAt: spamDecisions.createdAt,
      })
      .from(spamDecisions)
      .where(eq(spamDecisions.itemId, id))
      .orderBy(desc(spamDecisions.createdAt))
      .limit(50)

    return c.json({ item, decisions, stageB })
  })

  r.post('/items/:id/decision', async (c) => {
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    if (!reviewerAllowed(uid)) {
      return c.json({ error: 'reviewer not allowed' }, 403)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }
    const parsed = decisionBody.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const id = c.req.param('id')

    const [item] = await db
      .select({ id: spamItems.id, status: spamItems.status })
      .from(spamItems)
      .where(and(eq(spamItems.id, id), eq(spamItems.userId, uid)))
      .limit(1)
    if (!item) {
      return c.json({ error: 'not found' }, 404)
    }

    await db.insert(users).values({ id: uid }).onConflictDoNothing()

    const cat =
      parsed.data.categoryId != null
        ? await resolveCategoryId(db, uid, parsed.data.categoryId)
        : null

    await db.insert(spamDecisions).values({
      itemId: id,
      reviewerId: uid,
      action: parsed.data.action,
      categoryId: cat,
      rationale: parsed.data.rationale ?? null,
      agreedWithLlm: parsed.data.agreedWithLlm ?? null,
    })

    const act = parsed.data.action
    if (act === 'escalate') {
      await db
        .update(spamItems)
        .set({
          status: 'queued',
          decidedAt: null,
          finalAction: null,
          runId: null,
          llmScore: null,
          graphId: null,
        })
        .where(eq(spamItems.id, id))
      queueSpamStageB(uid, id)
    } else {
      const fa =
        act === 'allow'
          ? 'allow'
          : act === 'shadow'
            ? 'shadow'
            : act === 'quarantine'
              ? 'quarantine'
              : 'remove'
      await db
        .update(spamItems)
        .set({
          status: 'decided',
          decidedAt: dsql`now()`,
          finalAction: fa,
        })
        .where(eq(spamItems.id, id))
    }

    return c.json({ ok: true })
  })

  r.post('/webhook/:source', async (c) => {
    const secret = process.env.SPAM_INGEST_HMAC_SECRET?.trim()
    const raw = await c.req.text()
    if (secret && secret.length > 0) {
      const sig = c.req.header('x-spam-signature') ?? c.req.header('X-Spam-Signature')
      if (!verifyHmac(raw, sig, secret)) {
        return c.json({ error: 'invalid signature' }, 401)
      }
    }
    let json: unknown
    try {
      json = JSON.parse(raw) as unknown
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const srcParam = c.req.param('source')
    const obj =
      typeof json === 'object' && json != null && !Array.isArray(json)
        ? (json as Record<string, unknown>)
        : {}
    const merged = {
      ...obj,
      source:
        typeof obj.source === 'string' && obj.source.length > 0 ? obj.source : srcParam,
    }
    const parsed = ingestBody.safeParse(merged)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const db = getDb()
    if (db == null) {
      return c.json(noDb(), 503)
    }
    const uid = userId(c)
    const out = await ingestSpamItemFromPayload(db, uid, parsed.data)
    return c.json(out)
  })

  return r
}
