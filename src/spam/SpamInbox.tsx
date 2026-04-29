import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { apiPath } from '../lib/serverApi'
import { SpamRulesPanel } from './SpamRulesPanel'

const USER_HEADER = { 'X-User-Id': 'dev' }

type SpamItemRow = {
  id: string
  source: string
  externalId: string | null
  body: string
  status: string
  ruleScore: number | null
  llmScore: number | null
  finalAction: string | null
  categoryId: string | null
  createdAt: string
}

export function SpamInbox() {
  const [items, setItems] = useState<SpamItemRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const res = await apiFetch(apiPath('/api/spam/items'), {
        headers: USER_HEADER,
      })
      if (cancelled) return
      if (!res.ok) {
        const text = await res.text()
        setItems(null)
        setError(
          res.status === 503
            ? 'Database not configured (set DATABASE_URL and run migrations).'
            : text || `Request failed (${res.status})`,
        )
        return
      }
      const data = (await res.json()) as { items?: SpamItemRow[] }
      setItems(Array.isArray(data.items) ? data.items : [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="spam-inbox">
      <header className="spam-inbox-header">
        <h1 className="spam-inbox-title">Spam inbox</h1>
        <div className="spam-inbox-header-links">
          <a className="btn btn-muted" href="/spam?all=1" title="Include auto-resolved items">
            Show all
          </a>
          <a className="btn" href="/">
            Back to studio
          </a>
        </div>
      </header>

      <p className="spam-inbox-message spam-inbox-lede">
        Triage queue (status <code>new</code>, <code>queued</code>, <code>quarantined</code>). Items are
        scored by Stage A rules on ingest. Open a row to record a decision.
      </p>

      {error ? (
        <p className="spam-inbox-message">{error}</p>
      ) : items === null ? (
        <p className="spam-inbox-message">Loading…</p>
      ) : items.length === 0 ? (
        <p className="spam-inbox-message">
          Queue empty. POST to `/api/spam/items` to ingest (rules run automatically).
        </p>
      ) : (
        <ul className="spam-inbox-list">
          {items.map((row) => (
            <li key={row.id} className="spam-inbox-item">
              <a className="spam-inbox-item-link" href={`/spam?item=${encodeURIComponent(row.id)}`}>
                <div className="spam-inbox-item-meta">
                  <span className="spam-inbox-status">{row.status}</span>
                  <span className="spam-inbox-source">{row.source}</span>
                  <span className="spam-inbox-score">
                    rules {row.ruleScore != null ? row.ruleScore.toFixed(2) : '—'}
                  </span>
                  <time dateTime={row.createdAt}>{row.createdAt}</time>
                </div>
                <pre className="spam-inbox-body">{row.body}</pre>
              </a>
            </li>
          ))}
        </ul>
      )}

      <SpamRulesPanel />
    </div>
  )
}
