import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../store/graphStore'
import { usePortPositionStore } from '../store/portPositionStore'
import { useExecutionStore } from '../store/executionStore'
import { useWireStore } from '../store/wireStore'
import { useHistoryStore } from '../store/historyStore'
import { useViewport } from '../hooks/useViewport'
import type { GraphNode } from '../types'
import { RetrieveCorpusControls } from './RetrieveCorpusControls'

interface Props {
  nodeId: string
}

function NodeComponentImpl({ nodeId }: Props) {
  const { node, isSelected } = useGraphStore(
    useShallow((s) => ({
      node: s.nodes.get(nodeId) as GraphNode | undefined,
      isSelected: s.selection.has(nodeId),
    })),
  )
  const setNodePosition = useGraphStore((s) => s.setNodePosition)
  const setNodeWidgetValue = useGraphStore((s) => s.setNodeWidgetValue)
  const selectNode = useGraphStore((s) => s.selectNode)
  const setPortPosition = usePortPositionStore((s) => s.setPortPosition)
  const { toGraphSpace } = useViewport()

  const execState = useExecutionStore((s) => s.nodeStates.get(nodeId))
  const portElements = useRef<Map<string, HTMLElement>>(new Map())
  const wireStart = useWireStore((s) => s.start)

  const dragState = useRef<{
    startScreen: { x: number; y: number }
    startGraph: Map<string, { x: number; y: number }>
  } | null>(null)

  function onPointerMove(e: PointerEvent) {
    const d = dragState.current
    if (!d) return
    const { scale } = useGraphStore.getState().viewport
    const dx = (e.clientX - d.startScreen.x) / scale
    const dy = (e.clientY - d.startScreen.y) / scale
    for (const [id, start] of d.startGraph) {
      setNodePosition(id, { x: start.x + dx, y: start.y + dy })
    }
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove)
    dragState.current = null
    useHistoryStore.getState().commit()
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only; same handler identity as pointer sessions
    [],
  )

  // --- Port positions: read from store inside callbacks so we never re-render on pan ---
  function updatePortPosition(
    el: HTMLElement,
    direction: 'input' | 'output',
    index: number,
    ownerId: string,
  ) {
    const dot = el.querySelector('.port-dot') as HTMLElement | null
    if (!dot) return
    const rect = dot.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setPortPosition(ownerId, direction, index, toGraphSpace(cx, cy))
  }

  function refreshAllPorts() {
    const current = useGraphStore.getState().nodes.get(nodeId)
    if (!current) return
    current.inputs.forEach((_, i) => {
      const el = portElements.current.get(`input-${i}`)
      if (el) updatePortPosition(el, 'input', i, current.id)
    })
    current.outputs.forEach((_, i) => {
      const el = portElements.current.get(`output-${i}`)
      if (el) updatePortPosition(el, 'output', i, current.id)
    })
  }

  // Sync port anchors before paint (new nodes need positions before a wire from this output).
  useLayoutEffect(() => {
    refreshAllPorts()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshAllPorts uses nodeId + getState
  }, [nodeId, node?.position.x, node?.position.y, node?.width, node?.height])

  useEffect(() => {
    const raf = requestAnimationFrame(refreshAllPorts)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- second pass after final layout
  }, [nodeId, node?.position.x, node?.position.y, node?.width, node?.height])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        refreshAllPorts()
      })
    }
    const unsub = useGraphStore.subscribe((state, prev) => {
      const v = state.viewport
      const pv = prev.viewport
      if (
        v.translateX === pv.translateX &&
        v.translateY === pv.translateY &&
        v.scale === pv.scale
      ) {
        return
      }
      schedule()
    })
    return () => {
      unsub()
      cancelAnimationFrame(raf)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshAllPorts uses nodeId + getState
  }, [nodeId])

  if (!node) {
    return null
  }
  const n = node

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    selectNode(n.id, {
      additive: e.shiftKey,
      toggle: (e.metaKey || e.ctrlKey) && e.button === 0,
    })
    const sel = useGraphStore.getState().selection
    if (!sel.has(n.id)) {
      return
    }
    const startGraph = new Map<string, { x: number; y: number }>()
    for (const id of sel) {
      const selNode = useGraphStore.getState().nodes.get(id)
      if (selNode) startGraph.set(id, { ...selNode.position })
    }
    dragState.current = {
      startScreen: { x: e.clientX, y: e.clientY },
      startGraph,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function onOutputPortPointerDown(
    e: React.PointerEvent,
    portIndex: number,
  ) {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    const dot = el.querySelector('.port-dot') as HTMLElement | null
    if (!dot) return
    const r = dot.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const g = toGraphSpace(cx, cy)
    wireStart({
      sourceNodeId: n.id,
      sourcePortIndex: portIndex,
      cursor: g,
    })
  }

  function registerPort(
    el: HTMLElement | null,
    direction: 'input' | 'output',
    index: number,
  ) {
    const key = `${direction}-${index}`
    if (el) {
      portElements.current.set(key, el)
      updatePortPosition(el, direction, index, n.id)
    } else {
      portElements.current.delete(key)
    }
  }

  const status = execState?.status ?? 'idle'
  const commitW = () => useHistoryStore.getState().commit()

  return (
    <div
      className={`node status-${status}${isSelected ? ' selected' : ''}`}
      role="group"
      aria-label={`${n.label} (${n.type})`}
      data-node-id={n.id}
      tabIndex={0}
      style={{
        transform: `translate(${n.position.x}px, ${n.position.y}px)`,
        width: `${n.width}px`,
        minHeight: `${n.height}px`,
      }}
      onPointerDown={onPointerDown}
    >
      <div className="node-header">
        <span className="node-header-label">{n.label}</span>
        <span className={`status-dot status-dot-${status}`} />
      </div>

      {status === 'running' && (
        <div className="node-progress">
          <div
            className="node-progress-bar"
            style={{ width: `${(execState?.progress ?? 0) * 100}%` }}
          />
        </div>
      )}

      {status === 'done' &&
        execState &&
        Object.keys(execState.outputs).length > 0 && (
          <div className="node-output-summary">
            {Object.values(execState.outputs).map((o, i) => (
              <span key={i} className="output-tag">
                {o.type}
              </span>
            ))}
          </div>
        )}

      {status === 'error' && execState?.error && (
        <div className="node-error">{execState.error}</div>
      )}

      {n.type === 'AppInput' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="node-widget-label" htmlFor={`w-in-${n.id}`}>
            Prompt
          </label>
          <textarea
            id={`w-in-${n.id}`}
            className="node-widget-textarea"
            value={String(n.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(n.id, 0, e.target.value)}
            onBlur={commitW}
            rows={4}
            spellCheck
            aria-label="User prompt for this input node"
          />
        </div>
      )}

      {n.type === 'AppLlm' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="node-widget-label" htmlFor={`w-sys-${n.id}`}>
            System (optional)
          </label>
          <textarea
            id={`w-sys-${n.id}`}
            className="node-widget-textarea node-widget-textarea--sm"
            value={String(n.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(n.id, 0, e.target.value)}
            onBlur={commitW}
            rows={2}
            placeholder="Instructions for the model"
            spellCheck
            aria-label="System instructions for the model (optional)"
          />
        </div>
      )}

      {n.type === 'AppLlm' && (status === 'running' || status === 'done') && (
        <div
          className="node-widget node-widget--readonly"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="node-widget-label">Response</span>
          {status === 'running' &&
            !(
              execState?.outputs[0] &&
              String((execState.outputs[0] as { text?: string }).text ?? '')
                .length > 0
            ) && (
              <p className="node-output-preview-hint">Streaming…</p>
            )}
          {execState?.outputs[0] &&
            (execState.outputs[0] as { type?: string }).type === 'TEXT' &&
            String((execState.outputs[0] as { text?: string }).text ?? '')
              .length > 0 && (
              <pre className="node-output-preview">
                {String(
                  (execState.outputs[0] as { text?: string }).text ?? '',
                )}
              </pre>
            )}
        </div>
      )}

      {n.type === 'AppOutput' && (
        <div
          className="node-widget node-widget--readonly"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="node-widget-label">Result</span>
          {status === 'done' && execState?.outputs[0] && (
            <pre className="node-output-preview">
              {String(
                (execState.outputs[0] as { text?: string }).text ?? '',
              )}
            </pre>
          )}
          {status === 'running' && (
            <p className="node-output-preview-hint">Finishing up…</p>
          )}
          {(status === 'idle' || status === 'queued') && (
            <p className="node-output-preview-hint">
              Run the graph to see the final answer here.
            </p>
          )}
        </div>
      )}

      {n.type === 'AppTee' && (
        <div
          className="node-widget node-widget--readonly"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="node-inspector-hint">
            Duplicates the input to <strong>out A</strong> and <strong>out B</strong> (fan-out).
          </p>
        </div>
      )}

      {n.type === 'AppJoin' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="node-widget-label" htmlFor={`w-join-${n.id}`}>
            Separator (between a and b)
          </label>
          <input
            id={`w-join-${n.id}`}
            className="node-widget-input"
            type="text"
            value={String(n.widgetValues[0] ?? '\n')}
            onChange={(e) => setNodeWidgetValue(n.id, 0, e.target.value)}
            onBlur={commitW}
            aria-label="Text inserted between input a and b"
          />
        </div>
      )}

      {n.type === 'AppPrefix' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="node-widget-label" htmlFor={`w-pfx-${n.id}`}>
            Prefix
          </label>
          <input
            id={`w-pfx-${n.id}`}
            className="node-widget-input"
            type="text"
            value={String(n.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(n.id, 0, e.target.value)}
            onBlur={commitW}
            spellCheck
            aria-label="Prefix prepended to input text"
          />
        </div>
      )}

      {n.type === 'AppPick' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="node-widget-label" htmlFor={`w-pick-${n.id}`}>
            Use input
          </label>
          <select
            id={`w-pick-${n.id}`}
            className="node-widget-input"
            value={String(n.widgetValues[0] ?? '0')}
            onChange={(e) => {
              setNodeWidgetValue(n.id, 0, e.target.value)
              commitW()
            }}
            aria-label="Which input port to pass through"
          >
            <option value="0">0 (first wire)</option>
            <option value="1">1 (second wire)</option>
          </select>
        </div>
      )}

      {n.type === 'AppRetrieve' && (
        <div
          className="node-widget"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="node-widget-row">
            <label className="node-widget-label" htmlFor={`w-ret-k-${n.id}`}>
              Top K
            </label>
            <input
              id={`w-ret-k-${n.id}`}
              className="node-widget-input node-widget-input--narrow"
              type="number"
              min={1}
              max={10}
              value={String(n.widgetValues[0] ?? 3)}
              onChange={(e) =>
                setNodeWidgetValue(
                  n.id,
                  0,
                  Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              onBlur={commitW}
            />
            <label className="node-widget-label" htmlFor={`w-ret-sim-${n.id}`}>
              Similarity
            </label>
            <select
              id={`w-ret-sim-${n.id}`}
              className="node-widget-input"
              value={String(n.widgetValues[4] ?? 'bm25')}
              onChange={(e) => {
                setNodeWidgetValue(n.id, 4, e.target.value)
                commitW()
              }}
            >
              <option value="bm25">bm25 (no API key)</option>
              <option value="cosine">cosine (needs OPENAI_API_KEY)</option>
            </select>
          </div>
          <div className="node-widget-row">
            <label className="node-widget-label" htmlFor={`w-ret-cs-${n.id}`}>
              Chunk
            </label>
            <input
              id={`w-ret-cs-${n.id}`}
              className="node-widget-input node-widget-input--narrow"
              type="number"
              min={10}
              value={String(n.widgetValues[2] ?? 800)}
              onChange={(e) =>
                setNodeWidgetValue(n.id, 2, Math.max(10, Number(e.target.value) || 800))
              }
              onBlur={commitW}
            />
            <label className="node-widget-label" htmlFor={`w-ret-ov-${n.id}`}>
              Overlap
            </label>
            <input
              id={`w-ret-ov-${n.id}`}
              className="node-widget-input node-widget-input--narrow"
              type="number"
              min={0}
              value={String(n.widgetValues[3] ?? 100)}
              onChange={(e) =>
                setNodeWidgetValue(n.id, 3, Math.max(0, Number(e.target.value) || 0))
              }
              onBlur={commitW}
            />
          </div>
          <RetrieveCorpusControls nodeId={n.id} layout="node" />
        </div>
      )}

      {n.type === 'AppRetrieve' && status === 'done' && execState?.outputs[0] && (
        <div
          className="node-widget node-widget--readonly node-widget-retrieve-hits"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="node-widget-label">Top hits</span>
          <ul className="retrieve-hit-list">
            {(
              execState.outputs[0] as {
                retrieveHits?: {
                  citationIndex?: number
                  label?: string
                  source: string
                  score: number
                }[]
              }
            ).retrieveHits?.map((h, i) => (
              <li key={i}>
                {h.citationIndex != null && (
                  <span className="retrieve-hit-cite">[{h.citationIndex}]</span>
                )}
                <span className="retrieve-hit-score">
                  {h.score.toFixed(3)}
                </span>
                <span className="retrieve-hit-source">
                  {h.label ?? h.source}
                </span>
              </li>
            )) ?? <li>See snippets output (port).</li>}
          </ul>
        </div>
      )}

      <div className="node-body">
        <div className="ports ports-input">
          {n.inputs.map((port, i) => (
            <div
              key={`in-${i}`}
              className="port-row"
              data-input-port
              data-node-id={n.id}
              data-port-index={i}
              ref={(el) => registerPort(el, 'input', i)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                className="port-dot port-dot-input"
                data-type={port.dataType}
              />
              <span className="port-label">{port.name}</span>
            </div>
          ))}
        </div>

        <div className="ports ports-output">
          {n.outputs.map((port, i) => (
            <div
              key={`out-${i}`}
              className="port-row port-row-output"
              ref={(el) => registerPort(el, 'output', i)}
              onPointerDown={(e) => onOutputPortPointerDown(e, i)}
            >
              <span className="port-label">{port.name}</span>
              <div
                className="port-dot port-dot-output"
                data-type={port.dataType}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const NodeComponent = memo(
  NodeComponentImpl,
  (a, b) => a.nodeId === b.nodeId,
)
