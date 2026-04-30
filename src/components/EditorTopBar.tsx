import { SignedIn, UserButton } from '@clerk/clerk-react'
import { FilePlus, Loader2, Save, SaveAll } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react'
import { useGraphStore } from '../store/graphStore'
import { captureGraph } from '../lib/serializeGraph'
import { patchGraphOnServer, saveGraphToServer } from '../lib/serverApi'
import {
  useWorkflowDocStore,
  workflowIsDirty,
} from '../store/workflowDocStore'
import type { ComfyWorkflow } from '../types'
import { AppMenu } from './AppMenu'
import { useDialog } from '../lib/dialog'
import { iconPropsSm } from '../lib/lucideProps'
import { saveShortcutTitle } from '../lib/menuShortcutHint'

type Props = {
  onLoadWorkflow: (workflow: ComfyWorkflow) => void
  onExportGraph: () => void
  onNewWorkflow: () => void
  onRefreshSidebar: () => void
}

export type EditorTopBarHandle = {
  save: () => Promise<void>
}

export const EditorTopBar = forwardRef<EditorTopBarHandle, Props>(
  function EditorTopBar(
    {
      onLoadWorkflow,
      onExportGraph,
      onNewWorkflow,
      onRefreshSidebar,
    },
    ref,
  ) {
  const graphContentRevision = useGraphStore((s) => s.graphContentRevision)
  const serverGraphId = useWorkflowDocStore((s) => s.serverGraphId)
  const displayName = useWorkflowDocStore((s) => s.displayName)
  const savedName = useWorkflowDocStore((s) => s.savedName)
  const lastAlignedRevision = useWorkflowDocStore((s) => s.lastAlignedRevision)
  const setDisplayName = useWorkflowDocStore((s) => s.setDisplayName)
  const markNameSaved = useWorkflowDocStore((s) => s.markNameSaved)
  const openLocalGraph = useWorkflowDocStore((s) => s.openLocalGraph)
  const openServerGraph = useWorkflowDocStore((s) => s.openServerGraph)
  const setLastAlignedRevision = useWorkflowDocStore((s) => s.setLastAlignedRevision)

  const [saveBusy, setSaveBusy] = useState(false)
  const dirty = workflowIsDirty(graphContentRevision, lastAlignedRevision, displayName, savedName)
  const dialog = useDialog()

  const alignRevision = useCallback(() => {
    setLastAlignedRevision(useGraphStore.getState().graphContentRevision)
  }, [setLastAlignedRevision])

  const handleLocalReplace = useCallback(
    (label: string) => {
      requestAnimationFrame(() => {
        const r = useGraphStore.getState().graphContentRevision
        openLocalGraph(label, r)
      })
    },
    [openLocalGraph],
  )

  const handleServerOpened = useCallback(
    (id: string, name: string) => {
      requestAnimationFrame(() => {
        const r = useGraphStore.getState().graphContentRevision
        openServerGraph(id, name, r)
      })
    },
    [openServerGraph],
  )

  const doSave = useCallback(async () => {
    const data = captureGraph()
    const name = displayName.trim() || 'Untitled workflow'
    setSaveBusy(true)
    try {
      if (serverGraphId) {
        await patchGraphOnServer(serverGraphId, { name, data })
        setDisplayName(name)
        markNameSaved(name)
      } else {
        const id = await saveGraphToServer(data, name)
        openServerGraph(id, name, useGraphStore.getState().graphContentRevision)
      }
      alignRevision()
      onRefreshSidebar()
    } catch (e) {
      await dialog.alert(e instanceof Error ? e.message : 'Save failed', 'Save failed')
    } finally {
      setSaveBusy(false)
    }
  }, [
    dialog,
    displayName,
    serverGraphId,
    openServerGraph,
    setDisplayName,
    markNameSaved,
    alignRevision,
    onRefreshSidebar,
  ])

  const doSaveAs = useCallback(async () => {
    const suggested = displayName.trim() || 'Untitled workflow'
    const name = await dialog.prompt('Workflow name', suggested, 'Save as')
    if (!name) return
    setDisplayName(name)
    const data = captureGraph()
    setSaveBusy(true)
    try {
      const id = await saveGraphToServer(data, name)
      openServerGraph(id, name, useGraphStore.getState().graphContentRevision)
      alignRevision()
      onRefreshSidebar()
    } catch (e) {
      await dialog.alert(e instanceof Error ? e.message : 'Save failed', 'Save failed')
    } finally {
      setSaveBusy(false)
    }
  }, [dialog, displayName, setDisplayName, openServerGraph, alignRevision, onRefreshSidebar])

  useImperativeHandle(ref, () => ({ save: doSave }), [doSave])

  return (
    <header className="editor-top-bar">
      <div className="editor-top-bar-cluster editor-top-bar-left">
        <span className="editor-top-bar-logo">Flow Prompt</span>
        <AppMenu
          onLoadWorkflow={onLoadWorkflow}
          onExportGraph={onExportGraph}
          onLocalReplace={handleLocalReplace}
          onServerGraphOpened={handleServerOpened}
        />
      </div>

      <div className="editor-top-bar-doc-wrap">
        <span className="editor-top-bar-doc-label" id="workflow-title-heading">
          Workflow
        </span>
        <label className="visually-hidden" htmlFor="workflow-title-input">
          Workflow name
        </label>
        <input
          id="workflow-title-input"
          type="text"
          className="editor-top-bar-title-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Untitled — name this workflow"
          maxLength={200}
          autoComplete="off"
          aria-labelledby="workflow-title-heading"
        />
        {dirty ? (
          <span className="editor-top-bar-dirty-dot" title="Unsaved changes" aria-hidden />
        ) : null}
      </div>

      <div className="editor-top-bar-cluster editor-top-bar-actions">
        <button
          type="button"
          className="btn btn-top-bar btn-with-icon"
          disabled={saveBusy || (serverGraphId != null && !dirty)}
          title={
            serverGraphId
              ? `Save changes (${saveShortcutTitle()})`
              : `Save workflow (${saveShortcutTitle()})`
          }
          onClick={() => void doSave()}
        >
          {saveBusy ? (
            <>
              <Loader2 {...iconPropsSm} className={`${iconPropsSm.className} lucide-spin`} aria-hidden />
              Saving...
            </>
          ) : (
            <>
              <Save {...iconPropsSm} aria-hidden />
              Save
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-top-bar btn-with-icon"
          disabled={saveBusy}
          title="Save a copy under a new name"
          onClick={() => void doSaveAs()}
        >
          <SaveAll {...iconPropsSm} aria-hidden />
          Save as
        </button>
        <button
          type="button"
          className="btn btn-top-bar btn-top-bar-secondary btn-with-icon"
          onClick={onNewWorkflow}
        >
          <FilePlus {...iconPropsSm} aria-hidden />
          New
        </button>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
          <SignedIn>
            <span className="editor-top-bar-user">
              <UserButton />
            </span>
          </SignedIn>
        ) : null}
      </div>
    </header>
  )
})
