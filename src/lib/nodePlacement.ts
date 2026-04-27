import { toGraphSpace } from './viewportMath'
import { useGraphStore } from '../store/graphStore'

/**
 * Top-left of a new node so it appears near the **center of the graph canvas** in graph space
 * (uses `#graph-canvas` bounding box + current viewport).
 */
export function positionNewNodeInCanvasCenter(
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number } {
  const vp = useGraphStore.getState().viewport
  const el = document.getElementById('graph-canvas')
  const r = el?.getBoundingClientRect()
  const w = r?.width ?? 800
  const h = r?.height ?? 600
  const left = r?.left ?? 0
  const top = r?.top ?? 0
  const g = toGraphSpace(left + w / 2, top + h / 2, vp)
  // Slight jitter so repeated adds do not stack exactly.
  const jx = (Math.random() - 0.5) * 64
  const jy = (Math.random() - 0.5) * 64
  return {
    x: g.x - nodeWidth / 2 + jx,
    y: g.y - nodeHeight / 2 + jy,
  }
}
