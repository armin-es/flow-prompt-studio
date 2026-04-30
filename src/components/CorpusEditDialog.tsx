import { useId, useRef, useState } from 'react'
import { useDialog } from '../lib/dialog'
import { useCorpusStore, CORPUS_DEFAULT_ID } from '../store/corpusStore'
import type { CorpusEntry } from '../store/corpusTypes'
import {
  appendIngestedToCorpus,
  fileToIngestedDocument,
  filterIngestFiles,
  type IngestedDocument,
} from '../lib/corpusFileIngest'

type FormProps = {
  entry: CorpusEntry
  onSave: (name: string, body: string) => void
  onDelete: () => void
  onClose: () => void
  listCount: number
}

function CorpusEditForm({ entry, onSave, onDelete, onClose, listCount }: FormProps) {
  const [name, setName] = useState(entry.name)
  const [body, setBody] = useState(entry.body)
  const [ingestMsg, setIngestMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropId = useId()
  const dialog = useDialog()

  async function onSaveClick() {
    if (body.length > 65_536) {
      await dialog.alert('Corpus is too large (max 64 KB).', 'Too large')
      return
    }
    onSave(name.trim() || 'Untitled', body)
  }

  async function addFilesAsDocuments(files: File[]) {
    const allowed = filterIngestFiles(files)
    if (allowed.length === 0) {
      setIngestMsg('Only .md, .txt, and .json files are allowed (not PDFs in v1).')
      return
    }
    const docs: IngestedDocument[] = []
    for (const f of allowed) {
      docs.push(await fileToIngestedDocument(f))
    }
    const { body: next, error } = appendIngestedToCorpus(body, docs)
    if (error != null) {
      setIngestMsg(error)
      return
    }
    setBody(next)
    setIngestMsg(
      `Added ${docs.length} file(s) as new sections (# filename, then file contents, separated by ---).`,
    )
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    void addFilesAsDocuments(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      className="corpus-dialog"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h2 id="corpus-dialog-title" className="corpus-dialog-title">
        Edit corpus
      </h2>
      <p className="corpus-dialog-id">
        <code>{entry.id}</code>
      </p>
      <label className="corpus-dialog-field">
        <span>Name</span>
        <input
          className="node-widget-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck
        />
      </label>
      <div className="corpus-dialog-field">
        <div className="corpus-field-head">
          <span>
            Text (documents separated by <code>---</code>); max 64 KB. Drop <strong>.md</strong>,{' '}
            <strong>.txt</strong>, or <strong>.json</strong> here or use Browse.
          </span>
          <div className="corpus-browse-row">
            <input
              ref={fileInputRef}
              type="file"
              className="corpus-file-input"
              accept=".md,.txt,.json,text/markdown,text/plain,application/json"
              multiple
              onChange={(e) => {
                const list = e.target.files
                if (list?.length) {
                  void addFilesAsDocuments(Array.from(list))
                }
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="corpus-dialog-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse files…
            </button>
          </div>
        </div>
        <div
          id={dropId}
          className={`corpus-dropzone${dragOver ? ' corpus-dropzone--active' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.currentTarget === e.target) {
              setDragOver(false)
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={onDrop}
        >
          <textarea
            className="node-widget-textarea corpus-dialog-textarea"
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setIngestMsg(null)
            }}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            rows={16}
            spellCheck={false}
            aria-describedby={ingestMsg ? `${dropId}-ingest` : undefined}
          />
        </div>
        {ingestMsg != null && (
          <p id={`${dropId}-ingest`} className="corpus-ingest-msg" role="status">
            {ingestMsg}
          </p>
        )}
      </div>
      <div className="corpus-dialog-actions">
        {entry.id !== CORPUS_DEFAULT_ID && listCount > 1 && (
          <button type="button" className="corpus-dialog-btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="corpus-dialog-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="corpus-dialog-btn primary" onClick={() => void onSaveClick()}>
          Save
        </button>
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  corpusId: string
  onClose: () => void
}

export function CorpusEditDialog({ open, corpusId, onClose }: Props) {
  const entry = useCorpusStore((s) => s.byId[corpusId])
  const upsert = useCorpusStore((s) => s.upsert)
  const remove = useCorpusStore((s) => s.remove)
  const list = useCorpusStore((s) => s.list)
  const dialog = useDialog()

  if (!open || entry == null) {
    return null
  }

  return (
    <div
      className="corpus-dialog-backdrop"
      role="dialog"
      aria-modal
      aria-labelledby="corpus-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <CorpusEditForm
        key={entry.id}
        entry={entry}
        listCount={list().length}
        onClose={onClose}
        onSave={(name, body) => {
          upsert(corpusId, name, body)
          onClose()
        }}
        onDelete={() => void (async () => {
          if (corpusId === CORPUS_DEFAULT_ID) return
          if (list().length <= 1) return
          const ok = await dialog.confirm(
            'Delete this corpus? Retrieve nodes that reference it will fall back to Default.',
            'Delete corpus',
          )
          if (!ok) return
          remove(corpusId)
          onClose()
        })()}
      />
    </div>
  )
}
