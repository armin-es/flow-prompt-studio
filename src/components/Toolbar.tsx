import { useMemo } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Maximize2, Play, StepForward } from 'lucide-react'
import { useGraphStore } from '../store/graphStore'
import { useExecutionStore } from '../store/executionStore'
import { useRunOutputCacheStore } from '../store/runOutputCacheStore'
import { whyPartialRunInvalid } from '../lib/partialRunValidation'
import { iconPropsSm } from '../lib/lucideProps'
import { NodePalette } from './NodePalette'
import type { CreatableAppNodeType } from '../lib/createAppNode'

interface Props {
  onFitView: () => void
  onRun: () => void
  onRunFrom: () => void
  onAddAppNode: (type: CreatableAppNodeType) => void
}

export function Toolbar({
  onFitView,
  onRun,
  onRunFrom,
  onAddAppNode,
}: Props) {
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

  return (
    <div className="toolbar toolbar-docked">
      <div className="toolbar-primary-row">
        <div className="toolbar-center-actions">
          <button
            type="button"
            className="btn btn-with-icon"
            onClick={onFitView}
            title="Fit all nodes in view — F (disabled while typing in a text field)"
          >
            <Maximize2 {...iconPropsSm} aria-hidden />
            Fit
          </button>
          <button
            type="button"
            className={`btn btn-run btn-with-icon${isRunning ? ' btn-run-active' : ''}`}
            onClick={onRun}
            disabled={isRunning || nodeCount === 0}
            title="Run the graph in topological order"
            aria-label={isRunning ? 'Run in progress' : 'Run graph'}
            aria-busy={isRunning}
          >
            {isRunning ? (
              <>
                <Loader2 {...iconPropsSm} className={`${iconPropsSm.className} lucide-spin`} aria-hidden />
                Running...
              </>
            ) : (
              <>
                <Play {...iconPropsSm} aria-hidden />
                Run
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-with-icon"
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
            <StepForward {...iconPropsSm} aria-hidden />
            From here
          </button>
        </div>

        <div
          className="toolbar-info"
          title="Shift+drag box select, F fit, Esc stop/clear selection, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+M menu (see README)"
        >
          <span>Nodes: {nodeCount}</span>
          <span>Edges: {edgeCount}</span>
          <span>Zoom: {Math.round(scale * 100)}%</span>
          {isRunning && runningNode && (
            <span className="run-status run-status-active">
              {useGraphStore.getState().nodes.get(runningNode[0])?.type ?? '?'} ({doneCount}/
              {nodeCount})
            </span>
          )}
          {!isRunning && hasError && (
            <span className="run-status run-status-error">
              <AlertCircle {...iconPropsSm} aria-hidden />
              Error
            </span>
          )}
          {!isRunning && doneCount > 0 && !hasError && (
            <span className="run-status run-status-done">
              <CheckCircle2 {...iconPropsSm} aria-hidden />
              Done
            </span>
          )}
        </div>
      </div>

      <NodePalette onAdd={onAddAppNode} />
    </div>
  )
}
