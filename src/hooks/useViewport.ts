import { useGraphStore } from '../store/graphStore'
import {
  getGraphViewportClientOrigin,
  toGraphSpace,
  toScreenSpace,
} from '../lib/viewportMath'
import type { Point } from '../types'

/**
 * All pointer events arrive in screen space. The viewport applies a CSS
 * transform (translate + scale) to the graph container. These helpers
 * convert between the two coordinate systems so drag handlers, hit tests,
 * and edge endpoints always work correctly regardless of zoom level.
 *
 * Functions read from getState() so they are always fresh — safe to call
 * from event handlers without stale-closure issues.
 */
export function useViewport() {
  function toGraphSpaceFromStore(screenX: number, screenY: number): Point {
    return toGraphSpace(screenX, screenY, useGraphStore.getState().viewport)
  }

  function toScreenSpaceFromStore(graphX: number, graphY: number): Point {
    return toScreenSpace(graphX, graphY, useGraphStore.getState().viewport)
  }

  function pan(dx: number, dy: number) {
    const { viewport, setViewport } = useGraphStore.getState()
    setViewport({
      translateX: viewport.translateX + dx,
      translateY: viewport.translateY + dy,
    })
  }

  /**
   * Zoom toward a fixed screen-space point (e.g. cursor position).
   * Adjusts translation so the graph point under the cursor stays fixed.
   */
  function zoomAt(screenX: number, screenY: number, delta: number) {
    const { viewport, setViewport } = useGraphStore.getState()
    const o = getGraphViewportClientOrigin()
    const lx = screenX - o.x
    const ly = screenY - o.y
    const factor = delta > 0 ? 1.1 : 0.9
    const newScale = Math.min(4, Math.max(0.1, viewport.scale * factor))
    const newTranslateX =
      lx - (lx - viewport.translateX) * (newScale / viewport.scale)
    const newTranslateY =
      ly - (ly - viewport.translateY) * (newScale / viewport.scale)
    setViewport({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY })
  }

  return {
    toGraphSpace: toGraphSpaceFromStore,
    toScreenSpace: toScreenSpaceFromStore,
    pan,
    zoomAt,
  }
}
