import { useExecutionStore } from '../store/executionStore'
import { useRunResultStore } from '../store/runResultStore'
import { formatRunErrorForUser } from '../lib/formatRunError'

function formatTime(ts: number | undefined) {
  if (ts == null) return '—'
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function RunResultPanel() {
  const lastRun = useRunResultStore((s) => s.lastRun)
  const clear = useRunResultStore((s) => s.clear)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const requestCancel = useExecutionStore((s) => s.requestCancel)
  const resetAll = useExecutionStore((s) => s.resetAll)

  const statusLabel = {
    idle: 'Ready',
    running: 'Running…',
    ok: 'Complete',
    error: 'Error',
    cancelled: 'Cancelled',
  }[lastRun.status]

  return (
    <aside className="run-result-panel" aria-label="Run result">
      <div className="run-result-panel-header">
        <h2 className="run-result-title">Last run</h2>
        <div className="run-result-header-actions">
          {isRunning && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={requestCancel}
              title="Stop after the current node (Escape)"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              clear()
              resetAll()
            }}
            disabled={isRunning}
            title="Clear result and execution state"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className={`run-result-status run-result-status--${lastRun.status}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusLabel}
      </div>

      <dl className="run-result-meta">
        {lastRun.status === 'running' && lastRun.startedAt != null && (
          <div>
            <dt>Started</dt>
            <dd>{formatTime(lastRun.startedAt)}</dd>
          </div>
        )}
        {lastRun.status !== 'running' && lastRun.status !== 'idle' && (
          <div>
            <dt>Finished</dt>
            <dd>{formatTime(lastRun.finishedAt)}</dd>
          </div>
        )}
        {lastRun.runId && (
          <div>
            <dt>Run id</dt>
            <dd>
              <code className="run-result-runid">{lastRun.runId}</code>
            </dd>
          </div>
        )}
        {lastRun.sourceNodeType && (
          <div>
            <dt>Source node</dt>
            <dd title={lastRun.sourceNodeId}>{lastRun.sourceNodeType}</dd>
          </div>
        )}
        {lastRun.runMode === 'fromNode' && lastRun.fromNodeId && (
          <div>
            <dt>Run mode</dt>
            <dd title={lastRun.fromNodeId}>From node (partial)</dd>
          </div>
        )}
      </dl>

      <div className="run-result-body">
        {lastRun.status === 'idle' && (
          <p className="run-result-hint">Run the graph to see a summary of the final output here.</p>
        )}
        {lastRun.status === 'running' && (
          <p className="run-result-hint">Executing nodes…</p>
        )}
        {lastRun.summaryText && (
          <pre className="run-result-text">{lastRun.summaryText}</pre>
        )}
        {lastRun.error && (
          <p className="run-result-error" role="alert">
            {formatRunErrorForUser(lastRun.error)}
          </p>
        )}
        {lastRun.status === 'cancelled' && !lastRun.summaryText && (
          <p className="run-result-hint">Cancelled.</p>
        )}
      </div>
    </aside>
  )
}
