import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../lib/apiFetch'
import { apiPath } from '../lib/serverApi'

const USER_HEADER = { 'X-User-Id': 'dev' }

type SpamDetailPayload = {
  item: {
    id: string
    runId?: string | null
    source: string
    externalId: string | null
    body: string
    authorFeatures: Record<string, unknown>
    status: string
    ruleScore: number | null
    llmScore: number | null
    finalAction: string | null
    categoryId: string | null
    createdAt: string
    scoredAt: string | null
    decidedAt: string | null
  }
  stageB?: unknown
  decisions: Array<{
    id: string
    reviewerId: string | null
    action: string
    categoryId: string | null
    rationale: string | null
    policyQuote: string | null
    agreedWithLlm: boolean | null
    createdAt: string
  }>
}

export function SpamDetail({ itemId }: { itemId: string }) {
  const [data, setData] = useState<SpamDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const res = await apiFetch(apiPath(`/api/spam/items/${encodeURIComponent(itemId)}`), {
        headers: USER_HEADER,
      })
      if (cancelled) return
      if (!res.ok) {
        setData(null)
        setError(await res.text())
        return
      }
      setData((await res.json()) as SpamDetailPayload)
    })()
    return () => {
      cancelled = true
    }
  }, [itemId])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const action = String(fd.get('action') ?? '')
    const rationale = String(fd.get('rationale') ?? '').trim()
    setSubmitErr(null)
    setSubmitting(true)
    try {
      const res = await apiFetch(apiPath(`/api/spam/items/${encodeURIComponent(itemId)}/decision`), {
        method: 'POST',
        headers: { ...USER_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rationale: rationale.length > 0 ? rationale : undefined,
        }),
      })
      if (!res.ok) {
        setSubmitErr(await res.text())
        setSubmitting(false)
        return
      }
      window.location.href = '/spam'
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'Request failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="spam-inbox">
      <header className="spam-inbox-header">
        <h1 className="spam-inbox-title">Spam item</h1>
        <a className="btn" href="/spam">
          ← Inbox
        </a>
      </header>

      {error ? (
        <p className="spam-inbox-message">{error}</p>
      ) : data === null ? (
        <p className="spam-inbox-message">Loading…</p>
      ) : (
        <>
          <section className="spam-detail-section">
            <p className="spam-detail-meta">
              <strong>{data.item.status}</strong>
              {' · '}
              {data.item.source}
              {' · '}
              rule {data.item.ruleScore ?? '—'} · llm {data.item.llmScore ?? '—'} · final{' '}
              {data.item.finalAction ?? '—'} · created{' '}
              <time dateTime={data.item.createdAt}>{data.item.createdAt}</time>
            </p>
            <h2 className="spam-detail-sub">Body</h2>
            <pre className="spam-inbox-body">{data.item.body}</pre>
            <h2 className="spam-detail-sub">Author features</h2>
            <pre className="spam-detail-json">
              {JSON.stringify(data.item.authorFeatures, null, 2)}
            </pre>
          </section>

          {data.stageB != null ? (
            <section className="spam-detail-section">
              <h2 className="spam-detail-sub">Stage B (system)</h2>
              <pre className="spam-detail-json spam-detail-json--stageb">
                {typeof data.stageB === 'string'
                  ? data.stageB
                  : JSON.stringify(data.stageB, null, 2)}
              </pre>
            </section>
          ) : null}

          <section className="spam-detail-section">
            <h2 className="spam-detail-sub">Decisions (audit)</h2>
            {data.decisions.length === 0 ? (
              <p className="spam-inbox-message">None yet.</p>
            ) : (
              <ul className="spam-decisions-list">
                {data.decisions.map((d) => (
                  <li key={d.id}>
                    <span className="spam-decisions-action">{d.action}</span>
                    {d.reviewerId ? (
                      <span className="spam-decisions-reviewer"> · {d.reviewerId}</span>
                    ) : null}
                    <time dateTime={d.createdAt}> · {d.createdAt}</time>
                    {d.rationale ? (
                      <pre className="spam-decisions-rationale">{d.rationale}</pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="spam-detail-section">
            <h2 className="spam-detail-sub">Decision</h2>
            <form className="spam-decision-form" onSubmit={onSubmit}>
              <label className="spam-decision-field">
                <span>Action</span>
                <select name="action" required defaultValue="allow">
                  <option value="allow">Allow</option>
                  <option value="shadow">Shadow</option>
                  <option value="quarantine">Quarantine</option>
                  <option value="remove">Remove</option>
                  <option value="escalate">Escalate</option>
                </select>
              </label>
              <label className="spam-decision-field">
                <span>Rationale (optional)</span>
                <textarea name="rationale" rows={3} placeholder="Short note for audit log" />
              </label>
              {submitErr ? <p className="spam-detail-submit-err">{submitErr}</p> : null}
              <button type="submit" className="btn spam-decision-submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  )
}
