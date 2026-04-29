import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { apiPath } from '../lib/serverApi'

const USER_HEADER = { 'X-User-Id': 'dev' }

type RuleRow = {
  id: string
  name: string
  enabled: boolean
  weight: number
  kind: string
  config: unknown
}

export function SpamRulesPanel() {
  const [rules, setRules] = useState<RuleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const res = await apiFetch(apiPath('/api/spam/rules'), { headers: USER_HEADER })
      if (cancelled) return
      if (!res.ok) {
        setRules(null)
        setError(await res.text())
        return
      }
      const data = (await res.json()) as { rules?: RuleRow[] }
      setRules(Array.isArray(data.rules) ? data.rules : [])
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  async function toggleRule(id: string, enabled: boolean) {
    const res = await apiFetch(apiPath(`/api/spam/rules/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: { ...USER_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    })
    if (!res.ok) {
      setError(await res.text())
      return
    }
    setReloadToken((t) => t + 1)
  }

  return (
    <section className="spam-rules-panel">
      <h2 className="spam-detail-sub">Rules (Stage A)</h2>
      <p className="spam-inbox-message">
        Baseline rules are created on first use. Toggle to enable or disable. POST `/api/spam/rules`
        adds custom rules.
      </p>
      {error ? (
        <p className="spam-detail-submit-err">{error}</p>
      ) : rules === null ? (
        <p className="spam-inbox-message">Loading rules…</p>
      ) : rules.length === 0 ? (
        <p className="spam-inbox-message">No rules (unexpected).</p>
      ) : (
        <ul className="spam-rules-list">
          {rules.map((r) => (
            <li key={r.id} className="spam-rules-row">
              <label className="spam-rules-toggle">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => void toggleRule(r.id, r.enabled)}
                />
                <span className="spam-rules-name">{r.name}</span>
              </label>
              <span className="spam-rules-meta">
                {r.kind} · w{r.weight}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
