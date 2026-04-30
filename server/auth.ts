import { timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const COOKIE = 'fps_session'

function secretBytes(): Uint8Array | null {
  const s = process.env.AUTH_SECRET?.trim()
  if (s == null || s.length < 32) {
    return null
  }
  return new TextEncoder().encode(s)
}

function loginPassword(): string | undefined {
  const p = process.env.AUTH_PASSWORD?.trim()
  return p != null && p.length >= 8 ? p : undefined
}

function bearerToken(): string | undefined {
  const t = process.env.API_AUTH_TOKEN?.trim()
  return t != null && t.length >= 16 ? t : undefined
}

/** When `CLERK_SECRET_KEY` is set, `/api/*` uses Clerk JWTs (see `clerkMiddleware.ts`). */
export function isClerkAuthConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim())
}

/** When true, `/api/*` (except health + auth probe/login/logout) requires a session cookie or valid Bearer token. */
export function isAuthEnabled(): boolean {
  if (secretBytes() == null) {
    return false
  }
  return loginPassword() != null || bearerToken() != null
}

function skipAuthPath(pathname: string, method: string): boolean {
  if (pathname === '/api/health') {
    return true
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    return true
  }
  if (pathname === '/api/auth/status' && method === 'GET') {
    return true
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return true
  }
  return false
}

function bearerMatches(header: string | undefined): boolean {
  const expected = bearerToken()
  if (expected == null || header == null) {
    return false
  }
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (m == null) {
    return false
  }
  const got = m[1]!.trim()
  try {
    const a = Buffer.from(got, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) {
      return false
    }
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function verifySessionCookie(c: Context): Promise<boolean> {
  const raw = getCookie(c, COOKIE)
  const secret = secretBytes()
  if (raw == null || raw.length === 0 || secret == null) {
    return false
  }
  try {
    await jwtVerify(raw, secret, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export async function issueSessionCookie(c: Context): Promise<void> {
  const secret = secretBytes()
  if (secret == null) {
    throw new Error('AUTH_SECRET missing')
  }
  const token = await new SignJWT({ sub: 'fps' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)

  const secure =
    process.env.NODE_ENV === 'production' ||
    process.env.AUTH_COOKIE_SECURE === '1'

  setCookie(c, COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure,
    maxAge: 60 * 60 * 24 * 7,
  })
}

export function clearSessionCookie(c: Context): void {
  const secure =
    process.env.NODE_ENV === 'production' ||
    process.env.AUTH_COOKIE_SECURE === '1'
  deleteCookie(c, COOKIE, {
    path: '/',
    secure,
  })
}

export function authMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const path = url.pathname
    if (!path.startsWith('/api')) {
      return next()
    }
    if (!isAuthEnabled()) {
      return next()
    }
    if (skipAuthPath(path, c.req.method)) {
      return next()
    }
    const spamDevOk =
      path.startsWith('/api/spam') &&
      (process.env.NODE_ENV !== 'production' || process.env.SPAM_ALLOW_X_USER_ID === '1') &&
      Boolean(c.req.header('x-user-id')?.trim())
    if (spamDevOk) {
      return next()
    }
    const clerkId = c.get('resolvedUserId')
    if (typeof clerkId === 'string' && clerkId.length > 0) {
      return next()
    }
    if (bearerMatches(c.req.header('Authorization'))) {
      return next()
    }
    if (await verifySessionCookie(c)) {
      return next()
    }
    return c.json({ error: 'Unauthorized', code: 'auth_required' }, 401)
  }
}

export function hasPasswordLogin(): boolean {
  return loginPassword() != null
}

export async function getAuthStatusPayload(c: Context): Promise<{
  authenticated: boolean
  authDisabled: boolean
  loginWithPassword: boolean
  useClerk: boolean
}> {
  const clerkConfigured = isClerkAuthConfigured()

  if (!isAuthEnabled() && !clerkConfigured) {
    return {
      authenticated: true,
      authDisabled: true,
      loginWithPassword: false,
      useClerk: false,
    }
  }

  const resolved = c.get('resolvedUserId')
  const clerkOk = typeof resolved === 'string' && resolved.length > 0

  if (clerkConfigured && clerkOk) {
    return {
      authenticated: true,
      authDisabled: false,
      loginWithPassword: false,
      useClerk: true,
    }
  }

  if (clerkConfigured && !clerkOk) {
    return {
      authenticated: false,
      authDisabled: false,
      loginWithPassword: false,
      useClerk: true,
    }
  }

  const cookieOk = await verifySessionCookie(c)
  const bearerOk = bearerMatches(c.req.header('Authorization'))
  return {
    authenticated: cookieOk || bearerOk,
    authDisabled: false,
    loginWithPassword: hasPasswordLogin(),
    useClerk: false,
  }
}

export function validateLoginPassword(password: string): boolean {
  const expected = loginPassword()
  if (expected == null) {
    return false
  }
  try {
    const a = Buffer.from(password, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) {
      return false
    }
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
