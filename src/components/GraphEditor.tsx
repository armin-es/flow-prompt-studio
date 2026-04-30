import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createAppNode, type CreatableAppNodeType } from '../lib/createAppNode'
import { positionNewNodeInCanvasCenter } from '../lib/nodePlacement'
import { useGraphStore } from '../store/graphStore'
import { useHistoryStore } from '../store/historyStore'
import { isTypableFieldFocused } from '../lib/domUtils'
import { useExecutionStore } from '../store/executionStore'
import { runGraph, runGraphFromNode } from '../engine/runGraph'
import { Viewport } from './Viewport'
import { Toolbar } from './Toolbar'
import { menuShortcutHint } from '../lib/menuShortcutHint'
import { RightPanels } from './RightPanels'
import { PersistenceManager } from './PersistenceManager'
import { SAMPLE_COMFY_WORKFLOW } from '../data/sampleComfyWorkflow'
import { DEFAULT_APP_GRAPH } from '../data/defaultAppGraph'
import type { ComfyWorkflow } from '../types'
import { copySelection, getClipboard, buildPasteFromBuffer } from '../lib/clipboard'
import { applyGraph, captureGraph } from '../lib/serializeGraph'
import { resetHistoryToCurrent } from '../lib/graphHistory'
import { loadFullServerGraph } from '../lib/serverApi'
import { useDialog } from '../lib/dialog'
import {
  useWorkflowDocStore,
  workflowIsDirty,
} from '../store/workflowDocStore'
import { EditorTopBar, type EditorTopBarHandle } from './EditorTopBar'
import { WorkflowSidebar } from './WorkflowSidebar'

export function GraphEditor() {
  const mainRef = useRef<HTMLDivElement>(null)
  const topBarRef = useRef<EditorTopBarHandle>(null)
  const nodeCount = useGraphStore((s) => s.nodes.size)
  const loadWorkflow = useGraphStore((s) => s.loadWorkflow)
  const graphContentRevision = useGraphStore((s) => s.graphContentRevision)
  const deleteSelected = useGraphStore((s) => s.deleteSelected)
  const selectAllNodes = useGraphStore((s) => s.selectAllNodes)
  const mergeNodesAndEdges = useGraphStore((s) => s.mergeNodesAndEdges)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const requestCancel = useExecutionStore((s) => s.requestCancel)
  const clearSelection = useGraphStore((s) => s.clearSelection)

  const serverGraphId = useWorkflowDocStore((s) => s.serverGraphId)
  const displayName = useWorkflowDocStore((s) => s.displayName)
  const savedName = useWorkflowDocStore((s) => s.savedName)
  const lastAlignedRevision = useWorkflowDocStore((s) => s.lastAlignedRevision)
  const setLastAlignedRevision = useWorkflowDocStore((s) => s.setLastAlignedRevision)
  const openLocalGraph = useWorkflowDocStore((s) => s.openLocalGraph)
  const openServerGraph = useWorkflowDocStore((s) => s.openServerGraph)

  const [sidebarRefresh, setSidebarRefresh] = useState(0)
  const docDirty = workflowIsDirty(graphContentRevision, lastAlignedRevision, displayName, savedName)
  const dialog = useDialog()

  useLayoutEffect(() => {
    const r = useGraphStore.getState().graphContentRevision
    setLastAlignedRevision(r)
  }, [setLastAlignedRevision])

  const bumpSidebar = useCallback(() => {
    setSidebarRefresh((n) => n + 1)
  }, [])

  const onAddAppNode = useCallback((type: CreatableAppNodeType) => {
    const draft = createAppNode(type, { x: 0, y: 0 })
    const pos = positionNewNodeInCanvasCenter(draft.width, draft.height)
    const node = { ...draft, position: pos }
    mergeNodesAndEdges([node], [], true)
    useHistoryStore.getState().commit()
  }, [mergeNodesAndEdges])

  const fitToView = useCallback(() => {
    const { nodes, setViewport } = useGraphStore.getState()
    const nodeList = Array.from(nodes.values())
    if (nodeList.length === 0) return
    const padding = 80
    const el = mainRef.current
    const containerW = el?.clientWidth ?? window.innerWidth
    const containerH = el?.clientHeight ?? window.innerHeight
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const node of nodeList) {
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + node.width)
      maxY = Math.max(maxY, node.position.y + node.height)
    }
    const graphW = maxX - minX
    const graphH = maxY - minY
    const scale = Math.min(
      (containerW - padding * 2) / graphW,
      (containerH - padding * 2) / graphH,
      1,
    )
    setViewport({
      translateX: (containerW - graphW * scale) / 2 - minX * scale,
      translateY: (containerH - graphH * scale) / 2 - minY * scale,
      scale,
    })
  }, [])

  useLayoutEffect(() => {
    fitToView()
  }, [graphContentRevision, fitToView])

  const onLoadWorkflow = useCallback((workflow: ComfyWorkflow) => {
    loadWorkflow(workflow)
  }, [loadWorkflow])

  const exportGraph = useCallback(() => {
    const snap = captureGraph()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }),
    )
    a.download = 'flow-prompt-graph.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  const newWorkflow = useCallback(() => {
    useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
    resetHistoryToCurrent()
    const r = useGraphStore.getState().graphContentRevision
    openLocalGraph('Untitled workflow', r)
  }, [openLocalGraph])

  const openWorkflowFromServer = useCallback(
    (id: string) => {
      void loadFullServerGraph(id)
        .then((row) => {
          applyGraph(row.data)
          resetHistoryToCurrent()
          const r = useGraphStore.getState().graphContentRevision
          openServerGraph(row.id, row.name, r)
        })
        .catch(async (e) => {
          await dialog.alert(e instanceof Error ? e.message : 'Load failed', 'Load failed')
        })
    },
    [dialog, openServerGraph],
  )

  useEffect(() => {
    function nudgeSelected(dx: number, dy: number) {
      const { selection, nodes, setNodePosition } = useGraphStore.getState()
      if (selection.size === 0) return
      for (const id of selection) {
        const n = nodes.get(id)
        if (!n) continue
        setNodePosition(id, { x: n.position.x + dx, y: n.position.y + dy })
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypableFieldFocused()) {
        return
      }

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 's') {
        e.preventDefault()
        void topBarRef.current?.save()
        return
      }

      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useHistoryStore.getState().redo()
        return
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault()
        useHistoryStore.getState().undo()
        return
      }
      if (mod && e.key === 'a') {
        e.preventDefault()
        selectAllNodes()
        useHistoryStore.getState().commit()
        return
      }
      if (mod && e.key === 'c') {
        e.preventDefault()
        const s = useGraphStore.getState()
        copySelection(
          () => s.nodes,
          () => s.edges,
          s.selection,
        )
        return
      }
      if (mod && e.key === 'v') {
        e.preventDefault()
        const buf = getClipboard()
        if (buf) {
          const { nodes, edges } = buildPasteFromBuffer(buf, { x: 24, y: 24 })
          mergeNodesAndEdges(nodes, edges, true)
          useHistoryStore.getState().commit()
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        useHistoryStore.getState().commit()
        return
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        fitToView()
        return
      }

      if (e.key === 'Escape') {
        if (isRunning) {
          e.preventDefault()
          requestCancel()
        } else {
          clearSelection()
        }
        return
      }

      const step = e.shiftKey ? 8 : 1
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          nudgeSelected(0, -step)
          break
        case 'ArrowDown':
          e.preventDefault()
          nudgeSelected(0, step)
          break
        case 'ArrowLeft':
          e.preventDefault()
          nudgeSelected(-step, 0)
          break
        case 'ArrowRight':
          e.preventDefault()
          nudgeSelected(step, 0)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    fitToView,
    isRunning,
    requestCancel,
    clearSelection,
    deleteSelected,
    selectAllNodes,
    mergeNodesAndEdges,
  ])

  return (
    <div className="graph-editor">
      <PersistenceManager />
      <WorkflowSidebar
        selectedId={serverGraphId}
        isDirty={docDirty}
        graphContentRevision={graphContentRevision}
        lastAlignedRevision={lastAlignedRevision}
        displayName={displayName}
        savedName={savedName}
        refreshToken={sidebarRefresh}
        onPick={openWorkflowFromServer}
        onNew={newWorkflow}
        onDeletedCurrent={newWorkflow}
      />
      <div className="graph-editor-main-column">
        <EditorTopBar
          ref={topBarRef}
          onLoadWorkflow={onLoadWorkflow}
          onExportGraph={exportGraph}
          onNewWorkflow={newWorkflow}
          onRefreshSidebar={bumpSidebar}
        />
        <main
          className="graph-editor-canvas"
          id="graph-main"
          ref={mainRef}
          aria-label="Graph editor"
        >
          {nodeCount === 0 && (
            <div className="graph-editor-empty" role="status">
              <p className="graph-editor-empty-title">No workflow loaded</p>
              <p className="graph-editor-empty-hint">
                Open <strong>Menu</strong> (top left) or press{' '}
                <strong>{menuShortcutHint()}</strong> for templates (RAG, spam, agent, and more). Use{' '}
                <strong>Add node</strong> below to place blocks on the canvas, then drag from an
                output to an input. The
                dev server supplies the API (or echo without <code>OPENAI_API_KEY</code>).
              </p>
              <div className="graph-editor-empty-actions">
                <button
                  type="button"
                  className="btn graph-editor-empty-cta"
                  onClick={() => {
                    useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
                    resetHistoryToCurrent()
                    const r = useGraphStore.getState().graphContentRevision
                    openLocalGraph('Untitled workflow', r)
                  }}
                >
                  App pipeline
                </button>
                <button
                  type="button"
                  className="btn graph-editor-empty-cta"
                  onClick={() => {
                    loadWorkflow(SAMPLE_COMFY_WORKFLOW)
                    resetHistoryToCurrent()
                    const r = useGraphStore.getState().graphContentRevision
                    openLocalGraph('Comfy sample', r)
                  }}
                >
                  Comfy sample
                </button>
              </div>
            </div>
          )}
          <Viewport />
          <Toolbar
            onFitView={fitToView}
            onRun={runGraph}
            onRunFrom={() => {
              const s = useGraphStore.getState().selection
              if (s.size !== 1) return
              const id = [...s][0]!
              void runGraphFromNode(id)
            }}
            onAddAppNode={onAddAppNode}
          />
        </main>
      </div>
      <RightPanels />
    </div>
  )
}
