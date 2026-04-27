import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../store/graphStore'
import { useHistoryStore } from '../store/historyStore'
import { useCorpusStore, CORPUS_DEFAULT_ID } from '../store/corpusStore'
import { CorpusEditDialog } from './CorpusEditDialog'

type Props = {
  nodeId: string
  /** Slightly more room in inspector */
  layout?: 'node' | 'inspector'
}

/**
 * Corpus picker + create/edit for **AppRetrieve** (widget index 1 = corpus id).
 */
export function RetrieveCorpusControls({ nodeId, layout = 'node' }: Props) {
  const { widgetValues, setW } = useGraphStore(
    useShallow((s) => {
      const node = s.nodes.get(nodeId)
      return {
        widgetValues: node?.widgetValues,
        setW: s.setNodeWidgetValue,
      }
    }),
  )
  const create = useCorpusStore((s) => s.create)
  const list = useCorpusStore((s) => s.list)
  const [dialogOpen, setDialogOpen] = useState(false)
  if (widgetValues == null) {
    return null
  }
  const corpusId = String(widgetValues[1] ?? CORPUS_DEFAULT_ID)
  const isInspector = layout === 'inspector'
  const commit = () => useHistoryStore.getState().commit()

  return (
    <>
      <div
        className={isInspector ? 'node-inspector-corpus-row' : 'node-widget-row node-widget-row--corpus'}
      >
        <label
          className="node-widget-label"
          htmlFor={isInspector ? `insp-corpus-${nodeId}` : `w-ret-corpusid-${nodeId}`}
        >
          Corpus
        </label>
        <select
          id={isInspector ? `insp-corpus-${nodeId}` : `w-ret-corpusid-${nodeId}`}
          className="node-widget-input"
          value={corpusId}
          onChange={(e) => {
            setW(nodeId, 1, e.target.value)
            commit()
          }}
          aria-label="Named corpus for retrieval"
        >
          {list().map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="node-widget-corpus-actions">
          <button
            type="button"
            className="node-widget-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setDialogOpen(true)}
          >
            Edit…
          </button>
          <button
            type="button"
            className="node-widget-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const id = create('Untitled', '')
              setW(nodeId, 1, id)
              commit()
              setDialogOpen(true)
            }}
          >
            New
          </button>
        </div>
      </div>
      <p
        className={isInspector ? 'node-inspector-hint' : 'node-widget-hint'}
        onPointerDown={(e) => e.stopPropagation()}
      >
        Text is stored in IndexedDB by corpus id, not in the graph JSON. Max 64 KB per corpus
        (enforced on save in the dialog).
      </p>
      <CorpusEditDialog
        key={corpusId}
        open={dialogOpen}
        corpusId={corpusId}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}
