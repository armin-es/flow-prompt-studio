import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { apiPath } from '../lib/serverApi'

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'login'; error: string | null }
  | { phase: 'blocked' }
  | { phase: 'error'; message: string }

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ phase: 'loading' })

  const refreshStatus = useCallback(async () => {
    const r = await apiFetch(apiPath('/api/auth/status'))
    const j = (await r.json()) as {
      authenticated?: boolean
      authDisabled?: boolean
      loginWithPassword?: boolean
    }
    if (j.authDisabled) {
      setState({ phase: 'ready' })
      return
    }
    if (j.authenticated) {
      setState({ phase: 'ready' })
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
      } catch {
        if (!cancelled) {
          setState({
            phase: 'error',
            message:
              'Could not reach the API. Start the server (`npm run dev:server`) or check CORS / network.',
          })
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
              } catch {
                setState({
                  phase: 'error',
                  message:
                    'Could not reach the API. Start the server (`npm run dev:server`) or check CORS / network.',
                })
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
