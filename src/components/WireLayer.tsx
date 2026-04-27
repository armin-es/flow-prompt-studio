import { useGraphStore } from '../store/graphStore'
import { usePortPositionStore } from '../store/portPositionStore'
import { useWireStore } from '../store/wireStore'

function bezierPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const cx = Math.abs(to.x - from.x) * 0.5
  return `M ${from.x} ${from.y} C ${from.x + cx} ${from.y}, ${to.x - cx} ${to.y}, ${to.x} ${to.y}`
}

export function WireLayer() {
  const wire = useWireStore((s) => s.wire)
  const cursor = useWireStore((s) => s.cursor)
  const viewport = useGraphStore((s) => s.viewport)
  const from = usePortPositionStore((s) => {
    if (!wire) return null
    return s.positions.get(
      `${wire.sourceNodeId}:output:${wire.sourcePortIndex}`,
    )
  })
  if (!wire || !cursor) return null
  if (!from) return null
  const d = bezierPath(from, cursor)
  const { translateX, translateY, scale } = viewport
  return (
    <svg className="edge-layer wire-draft-layer" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g transform={`translate(${translateX},${translateY}) scale(${scale})`}>
        <path className="edge-path wire-draft" d={d} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
