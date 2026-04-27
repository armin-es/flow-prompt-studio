import type { CreatableAppNodeType } from '../lib/createAppNode'

const ITEMS: { type: CreatableAppNodeType; short: string; title: string }[] = [
  { type: 'AppInput', short: 'Input', title: 'Add Input (TEXT source)' },
  { type: 'AppLlm', short: 'LLM', title: 'Add LLM (API completion)' },
  { type: 'AppOutput', short: 'Output', title: 'Add Output (sink)' },
  { type: 'AppJoin', short: 'Join', title: 'Add Join (2 TEXT in → 1 out)' },
  { type: 'AppTee', short: 'Tee', title: 'Add Tee (1 in → 2 out)' },
  { type: 'AppPrefix', short: 'Prefix', title: 'Add Prefix' },
  { type: 'AppPick', short: 'Pick', title: 'Add Pick (choose input 0 or 1)' },
  {
    type: 'AppRetrieve',
    short: 'Retrieve',
    title: 'Add Retrieve (BM25/cosine over in-node corpus)',
  },
]

interface Props {
  onAdd: (type: CreatableAppNodeType) => void
}

export function NodePalette({ onAdd }: Props) {
  return (
    <div
      className="toolbar-node-palette"
      role="group"
      aria-label="Add app node to graph"
    >
      <span className="toolbar-node-palette-label">Add</span>
      {ITEMS.map(({ type, short, title }) => (
        <button
          key={type}
          type="button"
          className="btn btn-palette"
          onClick={() => onAdd(type)}
          title={title}
        >
          {short}
        </button>
      ))}
    </div>
  )
}
