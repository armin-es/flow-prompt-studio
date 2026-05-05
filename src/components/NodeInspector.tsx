import { useGraphStore } from '../store/graphStore'
import { useExecutionStore } from '../store/executionStore'
import { useShallow } from 'zustand/react/shallow'
import { useHistoryStore } from '../store/historyStore'
import { APP_INSPECTOR_TYPES } from '../data/appTextNodes'
import { RetrieveCorpusControls } from './RetrieveCorpusControls'
import type { GraphNode } from '../types'
import type { NodeOutput } from '../store/executionStore'

const INSPECTOR_TEXT_PREVIEW = 12_000

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function InspectorPortOutputPreview({
  portLabel,
  output,
}: {
  portLabel: string
  output: NodeOutput
}) {
  const typ = String(output.type ?? '')
  if (typ === 'TEXT') {
    const text = String((output as { text?: string }).text ?? '')
    const hits = (output as { retrieveHits?: { citationIndex: number; label: string; score: number }[] })
      .retrieveHits
    return (
      <div>
        <div className="node-inspector-output-port-label">{portLabel}</div>
        <pre className="node-inspector-output-pre">{truncateText(text, INSPECTOR_TEXT_PREVIEW)}</pre>
        {hits != null && hits.length > 0 && (
          <ul className="node-inspector-output-hits">
            {hits.slice(0, 12).map((h) => (
              <li key={h.citationIndex}>
                <span className="node-inspector-output-hit-label">
                  [{h.citationIndex}] {h.label}
                </span>
                <span className="node-inspector-output-hit-score">{h.score.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  if (typ === 'TOOLS') {
    const tools = (output as { tools?: unknown[] }).tools
    const n = Array.isArray(tools) ? tools.length : 0
    return (
      <div>
        <div className="node-inspector-output-port-label">{portLabel}</div>
        <pre className="node-inspector-output-pre">{`TOOLS (${n} definition${n === 1 ? '' : 's'})`}</pre>
      </div>
    )
  }
  let raw: string
  try {
    raw = truncateText(JSON.stringify(output, null, 2), INSPECTOR_TEXT_PREVIEW)
  } catch {
    raw = truncateText(String(output), INSPECTOR_TEXT_PREVIEW)
  }
  return (
    <div>
      <div className="node-inspector-output-port-label">{portLabel}</div>
      <pre className="node-inspector-output-pre">{raw}</pre>
    </div>
  )
}

function NodeInspectorLastRunOutputs({ nodeId, node }: { nodeId: string; node: GraphNode }) {
  const execState = useExecutionStore((s) => s.nodeStates.get(nodeId))

  if (!execState || execState.status === 'idle') {
    return (
      <p className="node-inspector-hint node-inspector-hint--outputs">
        After you <strong>Run</strong>, this node&apos;s outputs appear here (TEXT is scrollable). The{' '}
        <strong>Last run</strong> panel below still shows only the <em>final</em> sink summary.
      </p>
    )
  }

  if (execState.status === 'running') {
    return (
      <div className="node-inspector-run-output">
        <h4 className="node-inspector-subtitle">Outputs</h4>
        <p className="node-inspector-hint">Running…</p>
      </div>
    )
  }

  if (execState.status === 'error') {
    return (
      <div className="node-inspector-run-output node-inspector-run-output--error">
        <h4 className="node-inspector-subtitle">Last run on this node</h4>
        <p className="node-inspector-output-error" role="alert">
          {execState.error}
        </p>
      </div>
    )
  }

  const outs = execState.outputs
  const indices = Object.keys(outs)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)

  if (indices.length === 0) {
    return (
      <p className="node-inspector-hint">No outputs recorded for this node in the last run.</p>
    )
  }

  return (
    <div className="node-inspector-run-output">
      <h4 className="node-inspector-subtitle">Outputs (last run)</h4>
      {indices.map((pi) => {
        const o = outs[pi]
        if (!o) return null
        const portLabel =
          node.outputs[pi]?.name != null && String(node.outputs[pi]!.name).length > 0
            ? `${node.outputs[pi]!.name} (port ${pi})`
            : `Port ${pi}`
        return <InspectorPortOutputPreview key={pi} portLabel={portLabel} output={o} />
      })}
    </div>
  )
}

/**
 * Pinned right panel for a single selected node (widgets mirrored from the node for editing without zooming the canvas).
 */
export function NodeInspector() {
  const { selection, nodes, setNodeWidgetValue } = useGraphStore(
    useShallow((s) => ({
      selection: s.selection,
      nodes: s.nodes,
      setNodeWidgetValue: s.setNodeWidgetValue,
    })),
  )
  if (selection.size !== 1) {
    return null
  }
  const id = [...selection][0]!
  const node = nodes.get(id)
  if (!node) return null
  if (!(APP_INSPECTOR_TYPES as readonly string[]).includes(node.type)) {
    return null
  }

  return (
    <aside className="node-inspector" aria-label="Node inspector">
      <h3 className="node-inspector-title">Edit node</h3>
      <p className="node-inspector-meta">
        {node.type} · {node.id}
      </p>
      {node.type === 'AppInput' && (
        <label className="node-inspector-field">
          <span>Prompt</span>
          <textarea
            className="node-widget-textarea"
            value={String(node.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(id, 0, e.target.value)}
            onBlur={() => useHistoryStore.getState().commit()}
            rows={4}
            spellCheck
          />
        </label>
      )}
      {node.type === 'AppLlm' && (
        <label className="node-inspector-field">
          <span>System (optional)</span>
          <textarea
            className="node-widget-textarea"
            value={String(node.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(id, 0, e.target.value)}
            onBlur={() => useHistoryStore.getState().commit()}
            rows={3}
            spellCheck
          />
        </label>
      )}
      {node.type === 'AppOutput' && (
        <p className="node-inspector-hint">
          Sink node: upstream TEXT is summarized in <strong>Last run</strong> below. Select any upstream node to
          see its full outputs in <strong>Outputs (last run)</strong>.
        </p>
      )}
      {node.type === 'AppTee' && (
        <p className="node-inspector-hint">
          One input is copied to both outputs so you can wire two downstream paths (fan-out).
        </p>
      )}
      {node.type === 'AppJoin' && (
        <label className="node-inspector-field">
          <span>Separator (between a and b)</span>
          <input
            className="node-widget-input"
            type="text"
            value={String(node.widgetValues[0] ?? '\n')}
            onChange={(e) => setNodeWidgetValue(id, 0, e.target.value)}
            onBlur={() => useHistoryStore.getState().commit()}
          />
        </label>
      )}
      {node.type === 'AppPrefix' && (
        <label className="node-inspector-field">
          <span>Prefix</span>
          <input
            className="node-widget-input"
            type="text"
            value={String(node.widgetValues[0] ?? '')}
            onChange={(e) => setNodeWidgetValue(id, 0, e.target.value)}
            onBlur={() => useHistoryStore.getState().commit()}
            spellCheck
          />
        </label>
      )}
      {node.type === 'AppPick' && (
        <label className="node-inspector-field">
          <span>Use input</span>
          <select
            className="node-widget-input"
            value={String(node.widgetValues[0] ?? '0')}
            onChange={(e) => {
              setNodeWidgetValue(id, 0, e.target.value)
              useHistoryStore.getState().commit()
            }}
          >
            <option value="0">0 (first wire)</option>
            <option value="1">1 (second wire)</option>
          </select>
        </label>
      )}
      {node.type === 'AppToolsJoin' && (
        <p className="node-inspector-hint">
          Merge two <strong>TOOLS</strong> payloads (fan-in) so an <strong>Agent</strong> can see multiple tool definitions.
        </p>
      )}
      {node.type === 'AppTool' && (
        <>
          <label className="node-inspector-field">
            <span>Function name</span>
            <input
              className="node-widget-input"
              type="text"
              value={String(node.widgetValues[0] ?? '')}
              onChange={(e) => setNodeWidgetValue(id, 0, e.target.value)}
              onBlur={() => useHistoryStore.getState().commit()}
              spellCheck={false}
            />
          </label>
          <label className="node-inspector-field">
            <span>Description</span>
            <textarea
              className="node-widget-textarea"
              value={String(node.widgetValues[1] ?? '')}
              onChange={(e) => setNodeWidgetValue(id, 1, e.target.value)}
              onBlur={() => useHistoryStore.getState().commit()}
              rows={2}
            />
          </label>
          <label className="node-inspector-field">
            <span>Parameters (JSON Schema)</span>
            <textarea
              className="node-widget-textarea"
              value={String(node.widgetValues[2] ?? '{}')}
              onChange={(e) => setNodeWidgetValue(id, 2, e.target.value)}
              onBlur={() => useHistoryStore.getState().commit()}
              rows={4}
              spellCheck={false}
            />
          </label>
          <label className="node-inspector-field">
            <span>Built-in impl</span>
            <select
              className="node-widget-input"
              value={String(node.widgetValues[3] ?? 'echo')}
              onChange={(e) => {
                setNodeWidgetValue(id, 3, e.target.value)
                useHistoryStore.getState().commit()
              }}
            >
              <option value="retrieve">retrieve</option>
              <option value="http_get">http_get</option>
              <option value="calc">calc</option>
              <option value="echo">echo</option>
            </select>
          </label>
          {String(node.widgetValues[3] ?? 'echo') === 'retrieve' && (
            <label className="node-inspector-field">
              <span>Corpus id</span>
              <input
                className="node-widget-input"
                type="text"
                value={String(node.widgetValues[4] ?? '')}
                onChange={(e) => setNodeWidgetValue(id, 4, e.target.value)}
                onBlur={() => useHistoryStore.getState().commit()}
              />
            </label>
          )}
        </>
      )}
      {node.type === 'AppAgent' && (
        <>
          <label className="node-inspector-field">
            <span>Step budget (1–20)</span>
            <input
              className="node-widget-input"
              type="number"
              min={1}
              max={20}
              value={String(node.widgetValues[0] ?? 6)}
              onChange={(e) =>
                setNodeWidgetValue(
                  id,
                  0,
                  Math.min(20, Math.max(1, Number(e.target.value) || 6)),
                )
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <label className="node-inspector-field">
            <span>Model</span>
            <select
              className="node-widget-input"
              value={String(node.widgetValues[1] ?? 'gpt-4o-mini')}
              onChange={(e) => {
                setNodeWidgetValue(id, 1, e.target.value)
                useHistoryStore.getState().commit()
              }}
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
            </select>
          </label>
          <label className="node-inspector-field">
            <span>System prompt</span>
            <textarea
              className="node-widget-textarea"
              value={String(node.widgetValues[2] ?? '')}
              onChange={(e) => setNodeWidgetValue(id, 2, e.target.value)}
              onBlur={() => useHistoryStore.getState().commit()}
              rows={4}
            />
          </label>
          <p className="node-inspector-hint">
            Uses <code>POST /api/complete/tools</code> per step; tools execute in the browser.
            Partial-run cache treats this node as non-deterministic.
          </p>
        </>
      )}
      {node.type === 'AppSpamItemSource' && (
        <label className="node-inspector-field">
          <span>Spam item id (UUID)</span>
          <input
            className="node-inspector-input"
            type="text"
            value={String(node.widgetValues[0] ?? '')}
            placeholder="from /spam?item=…"
            onChange={(e) => setNodeWidgetValue(node.id, 0, e.target.value)}
            onBlur={() => useHistoryStore.getState().commit()}
            spellCheck={false}
          />
        </label>
      )}
      {node.type === 'AppSpamPasteSource' && (
        <>
          <label className="node-inspector-field">
            <span>Post body</span>
            <textarea
              className="node-widget-textarea"
              value={String(node.widgetValues[0] ?? '')}
              placeholder="Paste post or comment text…"
              onChange={(e) => setNodeWidgetValue(node.id, 0, e.target.value)}
              onBlur={() => useHistoryStore.getState().commit()}
              rows={6}
              spellCheck={false}
            />
          </label>
          <label className="node-inspector-field">
            <span>Account age (days)</span>
            <input
              className="node-widget-input"
              type="number"
              value={String(node.widgetValues[1] ?? 0)}
              onChange={(e) =>
                setNodeWidgetValue(node.id, 1, Math.trunc(Number(e.target.value) || 0))
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <label className="node-inspector-field">
            <span>Prior strikes</span>
            <input
              className="node-widget-input"
              type="number"
              min={0}
              value={String(node.widgetValues[2] ?? 0)}
              onChange={(e) =>
                setNodeWidgetValue(node.id, 2, Math.max(0, Math.trunc(Number(e.target.value) || 0)))
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <p className="node-inspector-hint">
            Same outputs as <strong>Spam item</strong>. Port 1 emits{' '}
            <code>account_age_days</code> and <code>prior_strikes</code> as JSON for Stage A rules.
          </p>
        </>
      )}
      {node.type === 'AppSpamRules' && (
        <p className="node-inspector-hint">
          Connect <strong>body</strong> (TEXT). Optional <strong>features JSON</strong> for{' '}
          <code>account_age_days</code>, <code>prior_strikes</code>, etc. Output is JSON with{' '}
          <code>score</code> and <code>derivedStatus</code>.
        </p>
      )}
      {node.type === 'AppRetrieve' && (
        <>
          <label className="node-inspector-field">
            <span>Top K (1–10)</span>
            <input
              className="node-widget-input"
              type="number"
              min={1}
              max={10}
              value={String(node.widgetValues[0] ?? 3)}
              onChange={(e) =>
                setNodeWidgetValue(
                  id,
                  0,
                  Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <div className="node-inspector-field node-inspector-field--block">
            <RetrieveCorpusControls nodeId={id} layout="inspector" />
          </div>
          <label className="node-inspector-field">
            <span>Chunk size (chars)</span>
            <input
              className="node-widget-input"
              type="number"
              min={10}
              value={String(node.widgetValues[2] ?? 800)}
              onChange={(e) =>
                setNodeWidgetValue(id, 2, Math.max(10, Number(e.target.value) || 800))
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <label className="node-inspector-field">
            <span>Chunk overlap (chars)</span>
            <input
              className="node-widget-input"
              type="number"
              min={0}
              value={String(node.widgetValues[3] ?? 100)}
              onChange={(e) =>
                setNodeWidgetValue(id, 3, Math.max(0, Number(e.target.value) || 0))
              }
              onBlur={() => useHistoryStore.getState().commit()}
            />
          </label>
          <label className="node-inspector-field">
            <span>Similarity</span>
            <select
              className="node-widget-input"
              value={String(node.widgetValues[4] ?? 'bm25')}
              onChange={(e) => {
                setNodeWidgetValue(id, 4, e.target.value)
                useHistoryStore.getState().commit()
              }}
            >
              <option value="bm25">BM25 (default, no API key)</option>
              <option value="cosine">Cosine (embeddings via /api/embed)</option>
            </select>
          </label>
        </>
      )}
      <NodeInspectorLastRunOutputs nodeId={id} node={node} />
    </aside>
  )
}
