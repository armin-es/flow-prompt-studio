import type { Point, ViewportState } from '../types'

/** The `.viewport` div (`Viewport.tsx`) — graph transforms are relative to this box. */
export const GRAPH_VIEWPORT_ELEMENT_ID = 'graph-viewport'

/** Top-left of the graph viewport in **client / window** pixels (for `getBoundingClientRect` math). */
export function getGraphViewportClientOrigin(): Point {
  if (typeof document === 'undefined') {
    return { x: 0, y: 0 }
  }
  const el = document.getElementById(GRAPH_VIEWPORT_ELEMENT_ID)
  if (!el) return { x: 0, y: 0 }
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top }
}

/**
 * Pure transforms — safe to unit test without a Zustand store.
 * Must stay in sync with `useViewport` screen ↔ graph space math.
 *
 * `screenX` / `screenY` must be **client** coordinates (e.g. from pointer events or
 * `getBoundingClientRect`). They are converted to **viewport-local** pixels using
 * `#graph-viewport`'s bounding rect, then inverse-transformed with pan/zoom.
 */
export function toGraphSpace(
  screenX: number,
  screenY: number,
  v: ViewportState,
): Point {
  const o = getGraphViewportClientOrigin()
  const lx = screenX - o.x
  const ly = screenY - o.y
  return {
    x: (lx - v.translateX) / v.scale,
    y: (ly - v.translateY) / v.scale,
  }
}

export function toScreenSpace(
  graphX: number,
  graphY: number,
  v: ViewportState,
): Point {
  const o = getGraphViewportClientOrigin()
  return {
    x: graphX * v.scale + v.translateX + o.x,
    y: graphY * v.scale + v.translateY + o.y,
  }
}
