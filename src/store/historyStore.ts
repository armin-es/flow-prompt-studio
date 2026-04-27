import { create } from 'zustand'
import { applyGraph, captureGraph, graphEquals, type SerializedGraph } from '../lib/serializeGraph'

const MAX = 100

interface HistoryState {
  snapshots: SerializedGraph[]
  index: number
  /** Replaces history after a full load; index becomes last entry. */
  resetFrom(capture: SerializedGraph): void
  commit(): void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  clear: () => void
}

function trimSnapshots(s: SerializedGraph[]): SerializedGraph[] {
  if (s.length <= MAX) return s
  const drop = s.length - MAX
  return s.slice(drop)
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  snapshots: [],
  index: -1,

  clear: () => set({ snapshots: [], index: -1 }),

  resetFrom: (captureSnap) => {
    set({
      snapshots: [structuredClone(captureSnap)],
      index: 0,
    })
  },

  commit: () => {
    const snap = captureGraph()
    set((s) => {
      const prev = s.snapshots[s.index]
      if (prev && graphEquals(prev, snap)) {
        return s
      }
      const nextSlice = s.snapshots.slice(0, s.index + 1)
      const combined = trimSnapshots([...nextSlice, structuredClone(snap)])
      return {
        snapshots: combined,
        index: combined.length - 1,
      }
    })
  },

  canUndo: () => get().index > 0,
  canRedo: () => {
    const { index, snapshots } = get()
    return index < snapshots.length - 1
  },

  undo: () => {
    const { index, snapshots } = get()
    if (index <= 0) return
    const next = index - 1
    const toApply = snapshots[next]
    if (toApply) {
      applyGraph(structuredClone(toApply))
    }
    set({ index: next })
  },

  redo: () => {
    const { index, snapshots } = get()
    if (index >= snapshots.length - 1) return
    const next = index + 1
    const toApply = snapshots[next]
    if (toApply) {
      applyGraph(structuredClone(toApply))
    }
    set({ index: next })
  },
}))
