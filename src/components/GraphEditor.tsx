import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { createAppNode, type CreatableAppNodeType } from '../lib/createAppNode'
import { positionNewNodeInCanvasCenter } from '../lib/nodePlacement'
import { useGraphStore } from '../store/graphStore'
import { useHistoryStore } from '../store/historyStore'
import { isTypableFieldFocused } from '../lib/domUtils'
import { useExecutionStore } from '../store/executionStore'
import { runGraph, runGraphFromNode } from '../engine/runGraph'
import { Viewport } from './Viewport'
import { Toolbar } from './Toolbar'
import { RightPanels } from './RightPanels'
import { PersistenceManager } from './PersistenceManager'
import { SAMPLE_COMFY_WORKFLOW } from '../data/sampleComfyWorkflow'
import { DEFAULT_APP_GRAPH } from '../data/defaultAppGraph'
import type { ComfyWorkflow } from '../types'
import { copySelection, getClipboard, buildPasteFromBuffer } from '../lib/clipboard'
import { captureGraph } from '../lib/serializeGraph'
import { resetHistoryToCurrent } from '../lib/graphHistory'

export function GraphEditor() {
  const mainRef = useRef<HTMLDivElement>(null)
  const nodeCount = useGraphStore((s) => s.nodes.size)
  const loadWorkflow = useGraphStore((s) => s.loadWorkflow)
  const graphContentRevision = useGraphStore((s) => s.graphContentRevision)
  const deleteSelected = useGraphStore((s) => s.deleteSelected)
  const selectAllNodes = useGraphStore((s) => s.selectAllNodes)
  const mergeNodesAndEdges = useGraphStore((s) => s.mergeNodesAndEdges)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const requestCancel = useExecutionStore((s) => s.requestCancel)
  const clearSelection = useGraphStore((s) => s.clearSelection)

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

  function onLoadWorkflow(workflow: ComfyWorkflow) {
    loadWorkflow(workflow)
  }

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
      <a className="skip-link" href="#graph-canvas">
        Skip to graph
      </a>
      <PersistenceManager />
      <main className="graph-editor-main" id="graph-main" ref={mainRef} aria-label="Graph editor">
        {nodeCount === 0 && (
          <div className="graph-editor-empty" role="status">
            <p className="graph-editor-empty-title">No workflow loaded</p>
            <p className="graph-editor-empty-hint">
              Load a preset, or use <strong>Add</strong> in the top bar to place app nodes, then
              drag from an output to an input to connect. Start the dev server for the API
              (or it falls back to echo without OPENAI_API_KEY).
            </p>
            <div className="graph-editor-empty-actions">
              <button
                type="button"
                className="btn graph-editor-empty-cta"
                onClick={() => {
                  useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
                  resetHistoryToCurrent()
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
                }}
              >
                Comfy sample
              </button>
            </div>
          </div>
        )}
        <Viewport />
        <Toolbar
          onLoadWorkflow={onLoadWorkflow}
          onFitView={fitToView}
          onRun={runGraph}
          onRunFrom={() => {
            const s = useGraphStore.getState().selection
            if (s.size !== 1) return
            const id = [...s][0]!
            void runGraphFromNode(id)
          }}
          onExportGraph={() => {
            const snap = captureGraph()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' }),
            )
            a.download = 'flow-prompt-graph.json'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
          onAddAppNode={onAddAppNode}
        />
      </main>
      <RightPanels />
    </div>
  )
}
