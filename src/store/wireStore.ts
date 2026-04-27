import { create } from 'zustand'
import type { NodeId, Point } from '../types'

type Wire = {
  sourceNodeId: NodeId
  sourcePortIndex: number
} | null

interface WireState {
  wire: Wire
  /** Graph-space cursor for the free end of the wire while dragging. */
  cursor: Point | null
  start: (s: { sourceNodeId: NodeId; sourcePortIndex: number; cursor: Point }) => void
  move: (p: Point) => void
  end: () => void
  cancel: () => void
}

export const useWireStore = create<WireState>()((set) => ({
  wire: null,
  cursor: null,
  start: (s) => set({ wire: { sourceNodeId: s.sourceNodeId, sourcePortIndex: s.sourcePortIndex }, cursor: s.cursor }),
  move: (p) => set({ cursor: p }),
  end: () => set({ wire: null, cursor: null }),
  cancel: () => set({ wire: null, cursor: null }),
}))
