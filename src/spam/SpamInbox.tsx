import { useCallback, useEffect, useState } from 'react'
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
  runId: string | null
  categoryId: string | null
  createdAt: string
}

function needsStageBPoll(rows: SpamItemRow[]): boolean {
  return rows.some(
    (r) =>
      (r.status === 'queued' || r.status === 'quarantined') && r.runId == null,
  )
}

interface SpamInboxProps {
  /** When true, lists every status (`GET /api/spam/items?all=1`). */
  showAll?: boolean
}

export function SpamInbox({ showAll = false }: SpamInboxProps) {
  const [items, setItems] = useState<SpamItemRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [seedBusy, setSeedBusy] = useState(false)
  const [seedMessage, setSeedMessage] = useState<string | null>(null)

  const itemsPath = showAll ? '/api/spam/items?all=1' : '/api/spam/items'

  const loadItems = useCallback(async () => {
    setError(null)
    const res = await apiFetch(apiPath(itemsPath), {
      headers: USER_HEADER,
    })
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
  }, [itemsPath])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await loadItems()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadItems, refreshKey])

  useEffect(() => {
    if (items == null || !needsStageBPoll(items)) {
      return
    }
    const t = window.setInterval(() => {
      void loadItems()
    }, 2000)
    return () => window.clearInterval(t)
  }, [items, loadItems])

  async function seedDemo(): Promise<void> {
    setSeedBusy(true)
    setSeedMessage(null)
    try {
      const res = await apiFetch(apiPath('/api/spam/demo/seed'), {
        method: 'POST',
        headers: { ...USER_HEADER, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const text = await res.text()
      if (!res.ok) {
        setSeedMessage(
          text ||
            `Seed failed (${res.status}). Is the API running on port 8787 with DATABASE_URL?`,
        )
        return
      }
      try {
        const j = JSON.parse(text) as {
          inserted?: unknown[]
          skipped?: unknown[]
        }
        const nIn = Array.isArray(j.inserted) ? j.inserted.length : 0
        const nSk = Array.isArray(j.skipped) ? j.skipped.length : 0
        setSeedMessage(
          nIn === 0 && nSk > 0
            ? `All ${nSk} demo item(s) already exist. Use Show all to see allowed/decided rows, or delete them in the DB to re-seed.`
            : `Loaded ${nIn} demo item(s); ${nSk} already existed.`,
        )
      } catch {
        setSeedMessage('Demo items requested.')
      }
      setRefreshKey((k) => k + 1)
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message.includes('fetch')
          ? 'Network error — start the API (e.g. npm run dev:server) so /api proxies to port 8787.'
          : e instanceof Error
            ? e.message
            : 'Request failed.'
      setSeedMessage(msg)
    } finally {
      setSeedBusy(false)
    }
  }

  return (
    <div className="spam-inbox">
      <header className="spam-inbox-header">
        <h1 className="spam-inbox-title">Spam inbox</h1>
        <div className="spam-inbox-header-links">
          <button
            type="button"
            className="btn btn-muted"
            disabled={seedBusy}
            onClick={() => void seedDemo()}
            title="POST /api/spam/demo/seed — sample posts; Stage A runs on ingest, Stage B follows in the background"
          >
            {seedBusy ? 'Loading demo…' : 'Load demo queue'}
          </button>
          {showAll ? (
            <a className="btn btn-muted" href="/spam" title="Only new, queued, and quarantined">
              Triage only
            </a>
          ) : (
            <a className="btn btn-muted" href="/spam?all=1" title="Include allowed, decided, and dropped">
              Show all
            </a>
          )}
          <a className="btn" href="/">
            Back to studio
          </a>
        </div>
      </header>

      <p className="spam-inbox-message spam-inbox-lede">
        Ingest runs <strong>Stage A</strong> (rules) immediately. For items that need a model pass,{' '}
        <strong>Stage B</strong> runs on the server using the same topology as the
        &quot;Spam pipeline&quot; graph (retrieval + judge + combine). Suggested actions stay here until
        you confirm or override on the detail page. Posts that Stage A marks <strong>allowed</strong>{' '}
        leave this list — use <a href="/spam?all=1">Show all</a> to see them.
      </p>

      {seedMessage ? <p className="spam-inbox-message spam-inbox-seed-msg">{seedMessage}</p> : null}

      {error ? (
        <p className="spam-inbox-message">{error}</p>
      ) : items === null ? (
        <p className="spam-inbox-message">Loading…</p>
      ) : items.length === 0 ? (
        <p className="spam-inbox-message">
          {showAll
            ? 'No items for this user. Use Load demo queue or POST to /api/spam/items.'
            : 'Triage queue is empty (nothing in new / queued / quarantined). Demo posts already ingested may be allowed or decided — try Show all.'}
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
                    rules {row.ruleScore != null ? row.ruleScore.toFixed(2) : '—'} · llm{' '}
                    {row.llmScore != null ? row.llmScore.toFixed(2) : row.runId == null && (row.status === 'queued' || row.status === 'quarantined') ? '…' : '—'}{' '}
                    · suggest <strong>{row.finalAction ?? '—'}</strong>
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
