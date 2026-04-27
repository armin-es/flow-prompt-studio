import { create } from 'zustand'
import type { NodeOutput } from './executionStore'

type PortOutputs = Record<string, NodeOutput>

/**
 * `nodeId → content stamp` (type + `widgetValues`) at last successful full
 * or partial run. **Run from here** reuses a cached port only when the
 * upstream node’s current stamp still matches the saved one.
 */
type NodeStamps = Record<string, string>

interface RunOutputCacheStore {
  portOutputs: PortOutputs
  nodeStamps: NodeStamps
  setFromRun: (outputs: Map<string, NodeOutput>, nodeStamps: NodeStamps) => void
  clear: () => void
  hasData: () => boolean
}

const empty: PortOutputs = {}

export const useRunOutputCacheStore = create<RunOutputCacheStore>()((set, get) => ({
  portOutputs: empty,
  nodeStamps: {},

  setFromRun: (outputs, nodeStamps) => {
    const portOutputs: PortOutputs = {}
    for (const [k, v] of outputs) {
      portOutputs[k] = v
    }
    set({ portOutputs, nodeStamps })
  },

  clear: () => set({ portOutputs: empty, nodeStamps: {} }),

  hasData: () => Object.keys(get().portOutputs).length > 0,
}))
