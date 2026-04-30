import { ChevronDown, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CreatableAppNodeType } from '../lib/createAppNode'
import { iconPropsSm } from '../lib/lucideProps'

type PaletteItem = { type: CreatableAppNodeType; short: string; title: string }

const GROUPS: { label: string; items: PaletteItem[] }[] = [
  {
    label: 'Basics',
    items: [
      { type: 'AppInput', short: 'Input', title: 'Add Input (TEXT source)' },
      { type: 'AppLlm', short: 'LLM', title: 'Add LLM (API completion)' },
      { type: 'AppOutput', short: 'Output', title: 'Add Output (sink)' },
    ],
  },
  {
    label: 'Flow',
    items: [
      { type: 'AppJoin', short: 'Join', title: 'Add Join (2 TEXT in → 1 out)' },
      { type: 'AppTee', short: 'Tee', title: 'Add Tee (1 in → 2 out)' },
      { type: 'AppPick', short: 'Pick', title: 'Add Pick (choose input 0 or 1)' },
      { type: 'AppPrefix', short: 'Prefix', title: 'Add Prefix' },
    ],
  },
  {
    label: 'Retrieval',
    items: [
      {
        type: 'AppRetrieve',
        short: 'Retrieve',
        title: 'Add Retrieve (BM25/cosine over in-node corpus)',
      },
    ],
  },
  {
    label: 'Spam',
    items: [
      {
        type: 'AppSpamRules',
        short: 'Spam rules',
        title: 'Add Spam rules (Stage A; POST /api/spam/evaluate)',
      },
      {
        type: 'AppSpamItemSource',
        short: 'Spam item',
        title: 'Load spam queue row by UUID (GET /api/spam/items/:id)',
      },
    ],
  },
  {
    label: 'Agent & tools',
    items: [
      {
        type: 'AppToolsJoin',
        short: 'Join+',
        title: 'Add Join for TOOLS (merge two tool defs)',
      },
      { type: 'AppAgent', short: 'Agent', title: 'Add Agent (tool-calling loop)' },
      { type: 'AppTool', short: 'Tool', title: 'Add Tool (built-in impl → TOOLS port)' },
    ],
  },
]

interface Props {
  onAdd: (type: CreatableAppNodeType) => void
}

export function NodePalette({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(ev: MouseEvent) {
      const el = wrapRef.current
      if (el && ev.target instanceof Node && !el.contains(ev.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  return (
    <div className="toolbar-node-palette" ref={wrapRef}>
      <button
        type="button"
        className="toolbar-add-node-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="node-palette-dropdown"
        id="node-palette-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus {...iconPropsSm} aria-hidden />
        <span className="toolbar-add-node-label">Add node</span>
        <span className="toolbar-add-node-chevron" aria-hidden>
          <ChevronDown {...iconPropsSm} />
        </span>
      </button>
      {open ? (
        <div
          id="node-palette-dropdown"
          className="node-palette-dropdown"
          role="listbox"
          aria-labelledby="node-palette-trigger"
        >
          <p className="node-palette-hint">
            Place a block on the canvas — drag ports to wire. Escape closes.
          </p>
          {GROUPS.map((group) => (
            <div key={group.label} className="node-palette-group">
              <div className="node-palette-group-label">{group.label}</div>
              <div className="node-palette-grid" role="group" aria-label={group.label}>
                {group.items.map(({ type, short, title }) => (
                  <button
                    key={type}
                    type="button"
                    role="option"
                    className="node-palette-chip"
                    title={title}
                    onClick={() => {
                      onAdd(type)
                      setOpen(false)
                    }}
                  >
                    {short}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
