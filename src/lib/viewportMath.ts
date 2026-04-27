import type { Point, ViewportState } from '../types'

/**
 * Pure transforms — safe to unit test without a Zustand store.
 * Must stay in sync with `useViewport` screen ↔ graph space math.
 */
export function toGraphSpace(
  screenX: number,
  screenY: number,
  v: ViewportState,
): Point {
  return {
    x: (screenX - v.translateX) / v.scale,
    y: (screenY - v.translateY) / v.scale,
  }
}

export function toScreenSpace(
  graphX: number,
  graphY: number,
  v: ViewportState,
): Point {
  return {
    x: graphX * v.scale + v.translateX,
    y: graphY * v.scale + v.translateY,
  }
}
