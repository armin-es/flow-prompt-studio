import { verifyToken } from '@clerk/backend'
import type { MiddlewareHandler } from 'hono'

function skipClerkAuth(pathname: string, method: string): boolean {
  if (pathname === '/api/health') {
    return true
  }
  if (pathname === '/api/auth/status' && method === 'GET') {
    return true
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    return true
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return true
  }
  return false
}

/** When `CLERK_SECRET_KEY` is set, require `Authorization: Bearer <session JWT>` on `/api/*` (except health + auth probe/login/logout). Sets `resolvedUserId` from the token `sub`. */
export function clerkAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const secret = process.env.CLERK_SECRET_KEY?.trim()
    if (!secret) {
      return next()
    }

    if (c.req.method === 'OPTIONS') {
      return next()
    }

    const url = new URL(c.req.url)
    const path = url.pathname
    if (!path.startsWith('/api')) {
      return next()
    }
    if (skipClerkAuth(path, c.req.method)) {
      return next()
    }

    const raw = c.req.header('Authorization')
    const m = /^Bearer\s+(.+)$/i.exec(raw?.trim() ?? '')
    const token = m?.[1]?.trim()

    /**
     * Local/demo: `/spam` uses `X-User-Id: dev` without a Clerk session. In production, require JWT
     * unless you set SPAM_ALLOW_X_USER_ID=1 (internal tooling only).
     */
    const spamDevHeaderOk =
      path.startsWith('/api/spam') &&
      (process.env.NODE_ENV !== 'production' || process.env.SPAM_ALLOW_X_USER_ID === '1')
    if (!token && spamDevHeaderOk) {
      const xUser = c.req.header('x-user-id')?.trim()
      if (xUser) {
        c.set('resolvedUserId', xUser)
        return next()
      }
    }

    if (!token) {
      return c.json({ error: 'Unauthorized', code: 'clerk_token_required' }, 401)
    }

    try {
      const payload = await verifyToken(token, { secretKey: secret })
      const sub = payload.sub
      if (typeof sub !== 'string' || sub.length === 0) {
        return c.json({ error: 'Unauthorized', code: 'invalid_token' }, 401)
      }
      c.set('resolvedUserId', sub)
    } catch {
      return c.json({ error: 'Unauthorized', code: 'invalid_token' }, 401)
    }

    return next()
  }
}

declare module 'hono' {
  interface ContextVariableMap {
    resolvedUserId?: string
  }
}
