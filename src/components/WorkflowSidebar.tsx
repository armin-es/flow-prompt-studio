import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { startTransition, useCallback, useEffect, useState } from 'react'
import {
  deleteServerGraph,
  listServerGraphs,
  type ServerGraphListItem,
} from '../lib/serverApi'
import { workflowIsDirty } from '../store/workflowDocStore'
import { useDialog } from '../lib/dialog'
import { iconPropsSm } from '../lib/lucideProps'

type Props = {
  selectedId: string | null
  isDirty: boolean
  graphContentRevision: number
  lastAlignedRevision: number
  displayName: string
  savedName: string
  refreshToken: number
  onPick: (id: string, name: string) => void
  onNew: () => void
  onDeletedCurrent: () => void
}

export function WorkflowSidebar({
  selectedId,
  isDirty,
  graphContentRevision,
  lastAlignedRevision,
  displayName,
  savedName,
  refreshToken,
  onPick,
  onNew,
  onDeletedCurrent,
}: Props) {
  const [items, setItems] = useState<ServerGraphListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const dialog = useDialog()

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const list = await listServerGraphs()
    if (list == null) {
      setErr('Could not list workflows (offline or DB unavailable).')
      setItems([])
    } else {
      setItems(list)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    startTransition(() => {
      void refresh()
    })
  }, [refresh, refreshToken])

  async function confirmSwitchIfDirty(): Promise<boolean> {
    if (!workflowIsDirty(graphContentRevision, lastAlignedRevision, displayName, savedName)) return true
    return dialog.confirm(
      'Discard unsaved changes on the canvas and open another workflow?',
      'Unsaved changes',
    )
  }

  async function handleDelete(g: ServerGraphListItem) {
    const extra =
      g.name === 'spam-default'
        ? '\n\nThis is the spam policy graph — Stage B may fall back without it.'
        : ''
    const ok = await dialog.confirm(
      `Delete workflow "${g.name}"?${extra}\nThis cannot be undone.`,
      'Delete workflow',
    )
    if (!ok) return
    try {
      await deleteServerGraph(g.id)
      await refresh()
      if (selectedId === g.id) onDeletedCurrent()
    } catch (e) {
      await dialog.alert(e instanceof Error ? e.message : 'Delete failed', 'Delete failed')
    }
  }

  return (
    <aside className="workflow-sidebar" aria-label="Saved workflows">
      <div className="workflow-sidebar-header">
        <span className="workflow-sidebar-title">Workflows</span>
        <button
          type="button"
          className="btn workflow-sidebar-refresh btn-with-icon"
          title="Refresh list"
          onClick={() => void refresh()}
        >
          <RefreshCw {...iconPropsSm} aria-hidden />
          Refresh
        </button>
      </div>
      <button type="button" className="btn workflow-sidebar-new btn-with-icon" onClick={onNew}>
        <Plus {...iconPropsSm} aria-hidden />
        New workflow
      </button>
      {loading ? (
        <p className="workflow-sidebar-muted workflow-sidebar-loading">
          <Loader2 {...iconPropsSm} className={`${iconPropsSm.className} lucide-spin`} aria-hidden />
          Loading...
        </p>
      ) : err ? (
        <p className="workflow-sidebar-error">{err}</p>
      ) : items.length === 0 ? (
        <p className="workflow-sidebar-muted">No saved workflows yet. Save from the top bar.</p>
      ) : (
        <ul className="workflow-sidebar-list">
          {items.map((g) => (
            <li key={g.id}>
              <div
                className={`workflow-sidebar-row${selectedId === g.id ? ' workflow-sidebar-row-active' : ''}`}
              >
                <button
                  type="button"
                  className="workflow-sidebar-open"
                  title={g.id}
                  onClick={() =>
                    void (async () => {
                      if (!(await confirmSwitchIfDirty())) return
                      onPick(g.id, g.name)
                    })()
                  }
                >
                  <span className="workflow-sidebar-name">{g.name}</span>
                  <span className="workflow-sidebar-date">
                    {new Date(g.updatedAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  className="workflow-sidebar-delete"
                  title={`Delete workflow ${g.name}`}
                  aria-label={`Delete workflow ${g.name}`}
                  onClick={() => void handleDelete(g)}
                >
                  <Trash2 {...iconPropsSm} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {isDirty ? <p className="workflow-sidebar-dirty">Unsaved changes</p> : null}
    </aside>
  )
}
