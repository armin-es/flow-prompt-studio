import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../store/graphStore'
import { usePortPositionStore } from '../store/portPositionStore'
import type { GraphEdge, Point } from '../types'

function bezierPath(from: Point, to: Point): string {
  const cx = Math.abs(to.x - from.x) * 0.5
  return `M ${from.x} ${from.y} C ${from.x + cx} ${from.y}, ${to.x - cx} ${to.y}, ${to.x} ${to.y}`
}

function EdgePath({
  edge,
  selected,
  onSelect,
}: {
  edge: GraphEdge
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
}) {
  const from = usePortPositionStore(
    (s) => s.positions.get(`${edge.sourceNodeId}:output:${edge.sourcePortIndex}`),
  )
  const to = usePortPositionStore(
    (s) => s.positions.get(`${edge.targetNodeId}:input:${edge.targetPortIndex}`),
  )
  if (!from || !to) return null
  const d = bezierPath(from, to)
  return (
    <g
      className="edge-hit-group"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      role="presentation"
    >
      <path
        className="edge-path edge-path-hit"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
      />
      <path
        className={`edge-path${selected ? ' edge-path-selected' : ''}`}
        d={d}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  )
}

function EdgeById({ edgeId }: { edgeId: string }) {
  const edge = useGraphStore((s) => s.edges.get(edgeId)) as GraphEdge
  const selected = useGraphStore((s) => s.edgeSelection.has(edgeId))
  const selectEdge = useGraphStore((s) => s.selectEdge)
  if (!edge) return null
  return (
    <EdgePath
      edge={edge}
      selected={selected}
      onSelect={(e) => {
        e.stopPropagation()
        selectEdge(edge.id, {
          additive: e.shiftKey,
          toggle: (e.metaKey || e.ctrlKey) && e.button === 0,
        })
      }}
    />
  )
}

export function EdgeLayer() {
  const viewport = useGraphStore((s) => s.viewport)
  const edgeIds = useGraphStore(useShallow((s) => Array.from(s.edges.keys())))
  const { translateX, translateY, scale } = viewport

  return (
    <svg
      className="edge-layer edge-layer-interactive"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform={`translate(${translateX}, ${translateY}) scale(${scale})`}>
        {edgeIds.map((id) => (
          <EdgeById key={id} edgeId={id} />
        ))}
      </g>
    </svg>
  )
}
