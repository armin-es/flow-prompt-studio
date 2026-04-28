import { useGraphStore } from '../store/graphStore'
import { useShallow } from 'zustand/react/shallow'
import { useHistoryStore } from '../store/historyStore'
import { APP_INSPECTOR_TYPES } from '../data/appTextNodes'
import { RetrieveCorpusControls } from './RetrieveCorpusControls'

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
          The output text appears on the node and in the Last run panel after a successful
          run.
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
    </aside>
  )
}
