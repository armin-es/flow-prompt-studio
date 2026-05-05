import { ChevronDown, Loader2, Menu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import {
  applyGraph,
  captureGraph,
  type SerializedGraph,
} from '../lib/serializeGraph'
import {
  apiPath,
  loadFullServerGraph,
  serverSyncEnabled,
} from '../lib/serverApi'
import { apiFetch } from '../lib/apiFetch'
import { getClerkTokenOptional } from '../lib/clerkTokenRegistry'
import { resetHistoryToCurrent } from '../lib/graphHistory'
import { isTypableFieldFocused } from '../lib/domUtils'
import {
  APP_TEMPLATE_ENTRIES,
  type AppTemplateEntry,
  type TemplateCtx,
} from '../lib/appTemplates'
import { menuShortcutHint } from '../lib/menuShortcutHint'
import type { PortableWorkflow } from '../types'
import { useDialog } from '../lib/dialog'
import { iconPropsSm } from '../lib/lucideProps'

const STARTER_TEMPLATES = APP_TEMPLATE_ENTRIES.filter((t) => t.category === 'starters')
const ADVANCED_TEMPLATES = APP_TEMPLATE_ENTRIES.filter((t) => t.category === 'advanced')

function isFlowSerializedGraphV1(p: unknown): p is SerializedGraph {
  if (p === null || typeof p !== 'object') return false
  const o = p as SerializedGraph
  return o.version === 1 && Array.isArray(o.nodes) && Array.isArray(o.edges)
}

function isPortableWorkflowJson(p: unknown): p is PortableWorkflow {
  if (p === null || typeof p !== 'object') return false
  return 'nodes' in p && 'links' in p && Array.isArray((p as PortableWorkflow).nodes)
}

function TemplateMenuSection({
  title,
  entries,
  templateCtx,
  onTemplatePick,
}: {
  title: string
  entries: AppTemplateEntry[]
  templateCtx: TemplateCtx
  onTemplatePick: (label: string) => void
}) {
  return (
    <>
      <div className="app-menu-section-label">{title}</div>
      <div className="app-menu-section" role="none">
        {entries.map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitem"
            className="app-menu-item"
            title={t.description}
            onClick={() => {
              t.apply(templateCtx)
              onTemplatePick(t.label)
            }}
          >
            <span className="app-menu-item-label">{t.label}</span>
            <span className="app-menu-item-desc">{t.description}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export type AppMenuProps = {
  onLoadWorkflow: (workflow: PortableWorkflow) => void
  onExportGraph: () => void
  /** Template or import: canvas no longer matches current server row */
  onLocalReplace: (displayName: string) => void
  onServerGraphOpened: (id: string, displayName: string) => void
}

export function AppMenu({
  onLoadWorkflow,
  onExportGraph,
  onLocalReplace,
  onServerGraphOpened,
}: AppMenuProps) {
  const loadAppGraph = useGraphStore((s) => s.loadAppGraph)
  const isSpamPipeline = useGraphStore((s) => {
    for (const n of s.nodes.values()) {
      if (n.type === 'AppSpamItemSource' || n.type === 'AppSpamPasteSource') return true
    }
    return false
  })
  const [publishBusy, setPublishBusy] = useState(false)
  const dialog = useDialog()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const shortcutHint = menuShortcutHint()

  const templateCtx: TemplateCtx = {
    loadAppGraph,
    loadPortableWorkflow: onLoadWorkflow,
    resetHistory: resetHistoryToCurrent,
  }

  async function publishSpamPolicy(): Promise<void> {
    setPublishBusy(true)
    try {
      const data = captureGraph()
      const token = await getClerkTokenOptional()
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!token) {
        h['X-User-Id'] = 'dev'
      }
      const res = await apiFetch(apiPath('/api/spam/pipeline'), {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify({ data }),
      })
      if (!res.ok) {
        const t = await res.text()
        await dialog.alert(`Publish failed (${res.status}): ${t}`, 'Publish failed')
        return
      }
      const j = (await res.json()) as { graphId?: string }
      if (j.graphId) {
        try {
          localStorage.setItem('flow-prompt-spam-pipeline-id', j.graphId)
        } catch {
          /* ignore */
        }
      }
      await dialog.alert('Spam policy published. The next ingest will use this graph\'s judge prompt.', 'Published')
    } catch (e) {
      await dialog.alert(e instanceof Error ? e.message : 'Publish failed', 'Publish failed')
    } finally {
      setPublishBusy(false)
    }
  }

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      const el = menuWrapRef.current
      if (el && ev.target instanceof Node && !el.contains(ev.target)) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypableFieldFocused()) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setMenuOpen((v) => !v)
        return
      }

      if (!menuOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    if (menuOpen) {
      document.addEventListener('mousedown', onDocMouseDown)
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [menuOpen])

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      await dialog.alert('Invalid JSON file', 'Import failed')
      return
    }
    if (isFlowSerializedGraphV1(parsed)) {
      try {
        applyGraph(parsed)
        resetHistoryToCurrent()
        onLocalReplace('Imported graph')
        setMenuOpen(false)
        return
      } catch (err) {
        await dialog.alert(
          `Could not load graph: ${err instanceof Error ? err.message : String(err)}`,
          'Import failed',
        )
        return
      }
    }
    if (isPortableWorkflowJson(parsed)) {
      onLoadWorkflow(parsed)
      resetHistoryToCurrent()
      onLocalReplace('Imported portable workflow')
      setMenuOpen(false)
      return
    }
    await dialog.alert(
      'Unrecognized format — use a Flow v1 export or portable workflow JSON (nodes + links).',
      'Import failed',
    )
  }

  async function openGraphByUuid(): Promise<void> {
    const id = (await dialog.prompt('Paste server graph UUID', '', 'Open by ID'))?.trim()
    if (!id) return
    try {
      const row = await loadFullServerGraph(id)
      applyGraph(row.data)
      resetHistoryToCurrent()
      onServerGraphOpened(row.id, row.name)
      setMenuOpen(false)
    } catch (e) {
      await dialog.alert(e instanceof Error ? e.message : 'Load failed', 'Load failed')
    }
  }

  const sync = serverSyncEnabled()

  function handleTemplatePick(label: string) {
    onLocalReplace(label)
    setMenuOpen(false)
  }

  return (
    <div className="toolbar-brand" ref={menuWrapRef}>
      <button
        type="button"
        className="toolbar-menu-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-controls="app-menu-dropdown"
        id="app-menu-trigger"
        title={`Templates, import/export — ${shortcutHint}`}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <Menu {...iconPropsSm} aria-hidden />
        <span className="toolbar-menu-label">Menu</span>
        <span className="toolbar-menu-chevron" aria-hidden>
          <ChevronDown {...iconPropsSm} />
        </span>
      </button>
      {menuOpen ? (
        <div
          id="app-menu-dropdown"
          className="app-menu-dropdown"
          role="menu"
          aria-labelledby="app-menu-trigger"
        >
          <div className="app-menu-hint">
            Templates · Import / Export{sync ? ' · Workflows live in the sidebar' : ''} — {shortcutHint}
          </div>
          <TemplateMenuSection
            title="Starters"
            entries={STARTER_TEMPLATES}
            templateCtx={templateCtx}
            onTemplatePick={handleTemplatePick}
          />
          <TemplateMenuSection
            title="Advanced"
            entries={ADVANCED_TEMPLATES}
            templateCtx={templateCtx}
            onTemplatePick={handleTemplatePick}
          />
          <div className="app-menu-divider" />
          <div className="app-menu-section-label">File</div>
          <div className="app-menu-section" role="none">
            <button
              type="button"
              role="menuitem"
              className="app-menu-item"
              onClick={() => importInputRef.current?.click()}
            >
              <span className="app-menu-item-label">Import JSON</span>
              <span className="app-menu-item-desc">Flow v1 graph or portable workflow JSON</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="app-menu-item"
              onClick={() => {
                onExportGraph()
                setMenuOpen(false)
              }}
            >
              <span className="app-menu-item-label">Export graph</span>
              <span className="app-menu-item-desc">Download JSON</span>
            </button>
          </div>
          {sync ? (
            <>
              <div className="app-menu-section-label">Open by id</div>
              <div className="app-menu-section" role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="app-menu-item"
                  onClick={() => void openGraphByUuid()}
                >
                  <span className="app-menu-item-label">Load workflow by UUID</span>
                  <span className="app-menu-item-desc">GET /api/graphs/:id</span>
                </button>
              </div>
            </>
          ) : null}
          <div className="app-menu-divider" />
          <div className="app-menu-section-label">Spam</div>
          <div className="app-menu-section" role="none">
            <a
              className="app-menu-item app-menu-link"
              role="menuitem"
              href="/spam"
              onClick={() => setMenuOpen(false)}
            >
              <span className="app-menu-item-label">Open spam inbox</span>
              <span className="app-menu-item-desc">Triage UI</span>
            </a>
            {isSpamPipeline ? (
              <button
                type="button"
                role="menuitem"
                className="app-menu-item"
                disabled={publishBusy}
                title="PATCH /api/spam/pipeline — active Stage B policy"
                onClick={() => void publishSpamPolicy().then(() => setMenuOpen(false))}
              >
                <span className="app-menu-item-label app-menu-item-label-with-icon">
                  {publishBusy ? (
                    <>
                      <Loader2 {...iconPropsSm} className={`${iconPropsSm.className} lucide-spin`} aria-hidden />
                      Publishing...
                    </>
                  ) : (
                    'Publish spam policy'
                  )}
                </span>
                <span className="app-menu-item-desc">From current canvas</span>
              </button>
            ) : (
              <div className="app-menu-muted">
                Publish appears when the graph includes Spam item source.
              </div>
            )}
          </div>
        </div>
      ) : null}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        className="visually-hidden"
        aria-hidden
        onChange={onFileChange}
      />
    </div>
  )
}
