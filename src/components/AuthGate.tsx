import { SignIn, useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { apiPath } from '../lib/serverApi'

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'login'; error: string | null }
  | { phase: 'blocked' }
  | { phase: 'error'; message: string }
  | { phase: 'clerk' }

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ phase: 'loading' })

  const refreshStatus = useCallback(async () => {
    const configuredOrigin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') ?? ''
    if (import.meta.env.PROD && configuredOrigin.length === 0) {
      throw new Error(
        'This deploy has no VITE_API_ORIGIN. In Vercel → Settings → Environment Variables, set VITE_API_ORIGIN to your Render API origin only (e.g. https://your-service.onrender.com — no path). Save, then Redeploy — Vite must rebuild so the value is embedded.',
      )
    }

    let r: Response
    try {
      r = await apiFetch(apiPath('/api/auth/status'))
    } catch {
      throw new Error(
        import.meta.env.DEV
          ? 'Could not reach the API. Run `npm run dev` (client + API) or `npm run dev:server`, then reload.'
          : 'Network/CORS error when calling the API. On Render, set CORS_ORIGINS to your exact Vercel origin (https://….vercel.app). Confirm VITE_API_ORIGIN is your Render URL, not the Vercel URL.',
      )
    }

    const text = await r.text()
    if (!r.ok) {
      throw new Error(
        `API replied with HTTP ${r.status}. Check VITE_API_ORIGIN points at Render (not Vercel) and the Render service is live.`,
      )
    }

    let j: {
      authenticated?: boolean
      authDisabled?: boolean
      loginWithPassword?: boolean
      useClerk?: boolean
    }
    try {
      j = JSON.parse(text) as typeof j
    } catch {
      throw new Error(
        'API returned non-JSON (often a 404 page). Set VITE_API_ORIGIN to your Render base URL and redeploy Vercel.',
      )
    }

    if (j.authDisabled) {
      setState({ phase: 'ready' })
      return
    }
    if (j.authenticated) {
      setState({ phase: 'ready' })
      return
    }
    if (j.useClerk) {
      setState({ phase: 'clerk' })
      return
    }
    if (j.loginWithPassword) {
      setState({ phase: 'login', error: null })
      return
    }
    setState({ phase: 'blocked' })
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshStatus()
      } catch (e) {
        if (!cancelled) {
          const message =
            e instanceof Error
              ? e.message
              : 'Could not reach the API. Start the server (`npm run dev:server`) or check CORS / network.'
          setState({ phase: 'error', message })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshStatus])

  async function onSubmitPassword(password: string) {
    setState({ phase: 'login', error: null })
    try {
      const r = await apiFetch(apiPath('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        setState({
          phase: 'login',
          error: j.error ?? (r.status === 401 ? 'Invalid password' : `Login failed (${r.status})`),
        })
        return
      }
      setState({ phase: 'ready' })
    } catch {
      setState({
        phase: 'login',
        error: 'Network error — try again.',
      })
    }
  }

  if (state.phase === 'loading') {
    return (
      <div className="auth-gate">
        <p className="auth-gate-title">Loading…</p>
      </div>
    )
  }

  if (state.phase === 'ready') {
    return <>{children}</>
  }

  if (state.phase === 'clerk') {
    const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
    if (!pk) {
      return (
        <div className="auth-gate">
          <p className="auth-gate-title">Clerk UI key missing</p>
          <p className="auth-gate-body">
            The API uses Clerk (<code>CLERK_SECRET_KEY</code>). Set{' '}
            <code>VITE_CLERK_PUBLISHABLE_KEY</code> for this frontend and redeploy so sign-in works.
          </p>
        </div>
      )
    }
    return <ClerkSignedInGate>{children}</ClerkSignedInGate>
  }

  if (state.phase === 'error') {
    return (
      <div className="auth-gate">
        <p className="auth-gate-title">Cannot connect</p>
        <p className="auth-gate-body">{state.message}</p>
        <button
          type="button"
          className="auth-gate-button"
          onClick={() => {
            setState({ phase: 'loading' })
            void (async () => {
              try {
                await refreshStatus()
              } catch (e) {
                const message =
                  e instanceof Error
                    ? e.message
                    : 'Could not reach the API. Start the server (`npm run dev:server`) or check CORS / network.'
                setState({ phase: 'error', message })
              }
            })()
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (state.phase === 'blocked') {
    return (
      <div className="auth-gate">
        <p className="auth-gate-title">Authentication required</p>
        <p className="auth-gate-body">
          The API is configured with <code>API_AUTH_TOKEN</code> only (no password login). Use a
          reverse proxy, or set <code>AUTH_PASSWORD</code> on the server for browser sign-in.
        </p>
      </div>
    )
  }

  return (
    <LoginForm
      error={state.error}
      onSubmit={onSubmitPassword}
    />
  )
}

function ClerkSignedInGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) {
    return (
      <div className="auth-gate">
        <p className="auth-gate-title">Loading…</p>
      </div>
    )
  }
  if (!isSignedIn) {
    return (
      <div className="auth-gate">
        <SignIn routing="hash" />
      </div>
    )
  }
  return <>{children}</>
}

function LoginForm({
  error,
  onSubmit,
}: {
  error: string | null
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  return (
    <div className="auth-gate">
      <p className="auth-gate-title">Sign in</p>
      <p className="auth-gate-body">
        This app proxies requests to OpenAI through the API. Enter the password configured as{' '}
        <code>AUTH_PASSWORD</code> on the server.
      </p>
      <form
        className="auth-gate-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(password)
        }}
      >
        <input
          type="password"
          className="auth-gate-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
        <button type="submit" className="auth-gate-button">
          Continue
        </button>
      </form>
      {error != null && error.length > 0 ? (
        <p className="auth-gate-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
