import { config } from 'dotenv'
import { serve } from '@hono/node-server'

config()
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import OpenAI from 'openai'
import { getDatabaseUrl, runMigrationsIfNeeded } from './db/client.js'
import { createPersistenceApp } from './persistenceApi.js'
import { clerkAuthMiddleware } from './clerkMiddleware.js'
import {
  authMiddleware,
  clearSessionCookie,
  getAuthStatusPayload,
  hasPasswordLogin,
  isAuthEnabled,
  isClerkAuthConfigured,
  issueSessionCookie,
  validateLoginPassword,
} from './auth.js'

const app = new Hono()

void runMigrationsIfNeeded().catch((e) => {
  console.error('[flow-prompt-studio] DB migration failed', e)
})

function allowedCorsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS?.split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0) ?? []
  if (fromEnv.length > 0) {
    return fromEnv
  }
  return [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ]
}

app.use(
  '/*',
  cors({
    origin: (origin) => {
      const allowed = allowedCorsOrigins()
      if (!origin || origin.length === 0) {
        return allowed[0] ?? ''
      }
      return allowed.includes(origin) ? origin : allowed[0] ?? ''
    },
    credentials: true,
  }),
)

app.use('/*', clerkAuthMiddleware())
app.use('/*', authMiddleware())

const completeSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(32_000),
  system: z.string().max(8_000).optional(),
})

const embedSchema = z.object({
  texts: z.array(z.string().min(1).max(32_000)).min(1).max(64),
})

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'flow-prompt-studio',
    database: getDatabaseUrl() != null,
    auth: isAuthEnabled() ? 'required' : 'off',
  }),
)

app.get('/api/auth/status', async (c) => {
  const payload = await getAuthStatusPayload(c)
  return c.json(payload)
})

app.post('/api/auth/login', async (c) => {
  if (!isAuthEnabled() || !hasPasswordLogin()) {
    return c.json({ error: 'Password login not configured' }, 503)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const pw =
    typeof body === 'object' &&
    body != null &&
    'password' in body &&
    typeof (body as { password?: unknown }).password === 'string'
      ? (body as { password: string }).password
      : ''
  if (!validateLoginPassword(pw)) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  await issueSessionCookie(c)
  return c.json({ ok: true })
})

app.post('/api/auth/logout', (c) => {
  clearSessionCookie(c)
  return c.json({ ok: true })
})

app.post('/api/embed', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = embedSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return c.json({ error: msg || 'Invalid request' }, 400)
  }
  const { texts } = parsed.data
  const key = process.env.OPENAI_API_KEY
  if (!key || key.length === 0) {
    return c.json({ vectors: null, reason: 'no-key' }, 200)
  }
  const ac = new AbortController()
  const onAbort = () => {
    ac.abort()
  }
  c.req.raw.signal.addEventListener('abort', onAbort, { once: true })
  const openai = new OpenAI({ apiKey: key })
  const model = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
  try {
    const res = await openai.embeddings.create(
      { model, input: texts },
      { signal: ac.signal },
    )
    c.req.raw.signal.removeEventListener('abort', onAbort)
    return c.json({
      vectors: [...res.data]
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding as number[]),
    })
  } catch (e: unknown) {
    c.req.raw.signal.removeEventListener('abort', onAbort)
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') {
      return c.json({ error: 'aborted' }, 503)
    }
    const message = e instanceof Error ? e.message : 'Embedding request failed'
    return c.json({ error: message }, 502)
  }
})

app.post('/api/complete', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = completeSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return c.json({ error: msg || 'Invalid request' }, 400)
  }
  const { prompt, system } = parsed.data

  const key = process.env.OPENAI_API_KEY
  if (!key || key.length === 0) {
    const slice = prompt.length > 2_000 ? `${prompt.slice(0, 2_000)}…` : prompt
    return c.json({
      text: `[echo / no OPENAI_API_KEY] ${slice}`,
    })
  }

  const openai = new OpenAI({ apiKey: key })
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        ...(system && system.length > 0
          ? [{ role: 'system' as const, content: system }]
          : []),
        { role: 'user' as const, content: prompt },
      ],
    })
    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    if (!text) {
      return c.json({ error: 'Model returned an empty message' }, 502)
    }
    return c.json({ text })
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : 'OpenAI request failed'
    return c.json({ error: message }, 502)
  }
})

app.post('/api/complete/stream', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = completeSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return c.json({ error: msg || 'Invalid request' }, 400)
  }
  const { prompt, system } = parsed.data
  return streamSSE(c, async (stream) => {
    const ac = new AbortController()
    const abort = () => {
      ac.abort()
    }
    stream.onAbort(abort)
    c.req.raw.signal.addEventListener('abort', abort, { once: true })

    const key = process.env.OPENAI_API_KEY
    if (!key || key.length === 0) {
      const slice = prompt.length > 2_000 ? `${prompt.slice(0, 2_000)}…` : prompt
      const echo = `[echo / no OPENAI_API_KEY] ${slice}`
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'token' as const, text: echo }),
        })
        await stream.writeSSE({
          data: JSON.stringify({ type: 'done' as const }),
        })
      } catch {
        // client disconnected
      }
      return
    }

    const openai = new OpenAI({ apiKey: key })
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    try {
      const res = await openai.chat.completions.create(
        {
          model,
          stream: true,
          messages: [
            ...(system && system.length > 0
              ? [{ role: 'system' as const, content: system }]
              : []),
            { role: 'user' as const, content: prompt },
          ],
        },
        { signal: ac.signal },
      )
      let accumulated = ''
      for await (const chunk of res) {
        if (ac.signal.aborted) {
          return
        }
        const t = chunk.choices[0]?.delta?.content
        if (t) {
          accumulated += t
          await stream.writeSSE({
            data: JSON.stringify({ type: 'token' as const, text: t }),
          })
        }
      }
      if (!ac.signal.aborted) {
        if (!accumulated.trim()) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'error' as const,
              message: 'Model returned an empty message',
            }),
          })
        } else {
          await stream.writeSSE({ data: JSON.stringify({ type: 'done' as const }) })
        }
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') {
        return
      }
      const message =
        e instanceof Error ? e.message : 'OpenAI request failed'
      if (!ac.signal.aborted) {
        try {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error' as const, message }),
          })
        } catch {
          // client disconnected
        }
      }
    }
  })
})

app.route('/api', createPersistenceApp())

const port = Number(process.env.PORT) || 8787

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    const db = getDatabaseUrl() != null
    console.log(
      `[flow-prompt-studio] API http://127.0.0.1:${info.port}  database=${
        db ? 'on' : 'off'
      }  auth=${
        isClerkAuthConfigured()
          ? 'clerk'
          : isAuthEnabled()
            ? 'legacy'
            : 'off'
      }  (…/api/health, /api/auth/*, /api/graphs*, /api/corpora*, POST /api/retrieve, /api/complete, /api/embed)`,
    )
  },
)
