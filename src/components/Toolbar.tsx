import { SignedIn, UserButton } from '@clerk/clerk-react'
import { useMemo } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useExecutionStore } from '../store/executionStore'
import { useRunOutputCacheStore } from '../store/runOutputCacheStore'
import { whyPartialRunInvalid } from '../lib/partialRunValidation'
import {
  applyGraph,
  captureGraph,
  type SerializedGraph,
} from '../lib/serializeGraph'
import {
  getLastServerGraphId,
  loadGraphFromServer,
  saveGraphToServer,
  serverSyncEnabled,
} from '../lib/serverApi'
import { resetHistoryToCurrent } from '../lib/graphHistory'
import type { ComfyWorkflow } from '../types'
import { SAMPLE_COMFY_WORKFLOW } from '../data/sampleComfyWorkflow'
import { DEFAULT_APP_GRAPH } from '../data/defaultAppGraph'
import { TOPOLOGY_DEMO_GRAPH } from '../data/topologyDemoGraph'
import { PICK_DEMO_GRAPH } from '../data/pickDemoGraph'
import { JOIN_LLM_DEMO_GRAPH } from '../data/joinLlmDemoGraph'
import { RAG_DEMO_GRAPH } from '../data/ragDemoGraph'
import { buildStressGraph } from '../data/stressGraph'
import { NodePalette } from './NodePalette'
import type { CreatableAppNodeType } from '../lib/createAppNode'

interface Props {
  onLoadWorkflow: (workflow: ComfyWorkflow) => void
  onFitView: () => void
  onRun: () => void
  onRunFrom: () => void
  onExportGraph: () => void
  onAddAppNode: (type: CreatableAppNodeType) => void
}

export function Toolbar({
  onLoadWorkflow,
  onFitView,
  onRun,
  onRunFrom,
  onExportGraph,
  onAddAppNode,
}: Props) {
  const loadAppGraph = useGraphStore((s) => s.loadAppGraph)
  const nodeCount = useGraphStore((s) => s.nodes.size)
  const edgeCount = useGraphStore((s) => s.edges.size)
  const selection = useGraphStore((s) => s.selection)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const portOutputs = useRunOutputCacheStore((s) => s.portOutputs)
  const nodeStamps = useRunOutputCacheStore((s) => s.nodeStamps)
  const oneSelected = selection.size === 1
  const fromHereReason = useMemo(() => {
    if (!oneSelected) {
      return null
    }
    const id = [...selection][0]!
    return whyPartialRunInvalid(id, nodes, edges, portOutputs, nodeStamps)
  }, [oneSelected, selection, nodes, edges, portOutputs, nodeStamps])
  const canRunFrom = oneSelected && fromHereReason == null
  const scale = useGraphStore((s) => s.viewport.scale)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const nodeStates = useExecutionStore((s) => s.nodeStates)

  const runningNode = Array.from(nodeStates.entries()).find(([, s]) => s.status === 'running')
  const doneCount = Array.from(nodeStates.values()).filter((s) => s.status === 'done').length
  const hasError = Array.from(nodeStates.values()).some((s) => s.status === 'error')

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      alert('Invalid JSON file')
      return
    }
    const p = parsed as { version?: number; nodes?: unknown; edges?: unknown } | ComfyWorkflow
    if (
      p &&
      typeof p === 'object' &&
      (p as SerializedGraph).version === 1 &&
      Array.isArray((p as SerializedGraph).nodes) &&
      Array.isArray((p as SerializedGraph).edges)
    ) {
      try {
        applyGraph(p as SerializedGraph)
        resetHistoryToCurrent()
        return
      } catch (err) {
        alert(
          `Could not load graph: ${err instanceof Error ? err.message : String(err)}`,
        )
        return
      }
    }
    if (
      p &&
      typeof p === 'object' &&
      'nodes' in p &&
      'links' in p &&
      Array.isArray((p as ComfyWorkflow).nodes)
    ) {
      onLoadWorkflow(p as ComfyWorkflow)
      resetHistoryToCurrent()
      return
    }
    alert('Unrecognized format (use Flow v1 export or ComfyUI workflow JSON).')
  }

  return (
    <div className="toolbar">
      <div className="toolbar-upper">
        <span className="toolbar-title">Flow Prompt</span>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
          <SignedIn>
            <span className="toolbar-user">
              <UserButton />
            </span>
          </SignedIn>
        ) : null}

        <div className="toolbar-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(DEFAULT_APP_GRAPH)
            resetHistoryToCurrent()
          }}
          title="Input → LLM → Output (needs API, see README)"
        >
          App pipeline
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(TOPOLOGY_DEMO_GRAPH)
            resetHistoryToCurrent()
          }}
          title="Tee + Join: fan-out and fan-in (TEXT only, no API)"
        >
          Tee/Join
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(PICK_DEMO_GRAPH)
            resetHistoryToCurrent()
          }}
          title="Two inputs → pick one → output (selective fan-in)"
        >
          Pick 2→1
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(JOIN_LLM_DEMO_GRAPH)
            resetHistoryToCurrent()
          }}
          title="Task + context → Join → LLM → Output (needs API, see README)"
        >
          Join+LLM
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(RAG_DEMO_GRAPH)
            resetHistoryToCurrent()
          }}
          title="Question → Tee → Retrieve + Join → LLM; BM25 default (no key required for retrieval)"
        >
          RAG
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onLoadWorkflow(SAMPLE_COMFY_WORKFLOW)
            resetHistoryToCurrent()
          }}
        >
          Comfy demo
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            loadAppGraph(buildStressGraph(200))
            resetHistoryToCurrent()
          }}
          title="Load 200 nodes (stress; see README perf section)"
        >
          Stress 200
        </button>
        <label className="btn">
          Import JSON
          <input type="file" accept=".json" hidden onChange={onFileChange} />
        </label>
        <button type="button" className="btn" onClick={onExportGraph}>
          Export
        </button>
        {serverSyncEnabled() && (
          <>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  const id = await saveGraphToServer(captureGraph(), 'Graph')
                  alert(
                    `Saved to server. Graph id:\n${id}\n(Use "Load from server" in this or another browser.)`,
                  )
                } catch (e) {
                  alert(
                    e instanceof Error ? e.message : 'Failed to save graph to server (check DATABASE_URL and .env).',
                  )
                }
              }}
              title="POST /api/graphs (needs DATABASE_URL, VITE_SYNC_SERVER=1; Clerk or X-User-Id scopes tenant)"
            >
              Save to server
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const def = getLastServerGraphId() ?? ''
                const id = window.prompt('Server graph id (UUID)', def)
                if (id == null || id.trim() === '') {
                  return
                }
                try {
                  const g = await loadGraphFromServer(id.trim())
                  applyGraph(g)
                  resetHistoryToCurrent()
                } catch (e) {
                  alert(
                    e instanceof Error ? e.message : 'Failed to load graph from server',
                  )
                }
              }}
              title="GET /api/graphs/:id"
            >
              Load from server
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={onFitView}
          title="Fit all nodes in view. Shortcut F (disabled while typing in a text field)"
        >
          Fit View
        </button>
        <button
          type="button"
          className={`btn btn-run${isRunning ? ' btn-run-active' : ''}`}
          onClick={onRun}
          disabled={isRunning || nodeCount === 0}
          title="Run the graph in topological order"
          aria-label={isRunning ? 'Run in progress' : 'Run graph'}
          aria-busy={isRunning}
        >
          {isRunning ? '⏳ Running…' : '▶ Run'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRunFrom}
          disabled={isRunning || nodeCount === 0 || !oneSelected || !canRunFrom}
          title={
            !oneSelected
              ? 'Select exactly one node, then re-run it and all downstream nodes.'
              : fromHereReason != null
                ? fromHereReason
                : 'Re-run the selected node and all downstream nodes (uses cached upstream outputs).'
          }
          aria-label="Run from selected node downstream"
        >
          ⏩ From here
        </button>
      </div>

      <div
        className="toolbar-info"
        title="Shift+drag to box select · F fit · Esc stop/clear · Cmd/Ctrl+Z undo — see README"
      >
        <span>Nodes: {nodeCount}</span>
        <span>Edges: {edgeCount}</span>
        <span>Zoom: {Math.round(scale * 100)}%</span>
        {isRunning && runningNode && (
          <span className="run-status run-status-active">
            {useGraphStore.getState().nodes.get(runningNode[0])?.type ?? '…'} ({doneCount}/
            {nodeCount})
          </span>
        )}
        {!isRunning && hasError && (
          <span className="run-status run-status-error">✗ Error</span>
        )}
        {!isRunning && doneCount > 0 && !hasError && (
          <span className="run-status run-status-done">✓ Done</span>
        )}
      </div>
      </div>

      <NodePalette onAdd={onAddAppNode} />
    </div>
  )
}
