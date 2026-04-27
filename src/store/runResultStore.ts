import { create } from 'zustand'

export type RunResultStatus = 'idle' | 'running' | 'ok' | 'error' | 'cancelled'

export interface LastRunState {
  status: RunResultStatus
  /** Traces a single run for debugging and interviews. */
  runId?: string
  startedAt?: number
  finishedAt?: number
  /** Human-readable result (e.g. final SaveImage path, or error message) */
  summaryText: string
  error?: string
  sourceNodeId?: string
  sourceNodeType?: string
  /** `fromNode` = re-ran from a selected node using cached upstream outputs. */
  runMode?: 'full' | 'fromNode'
  fromNodeId?: string
}

const initial: LastRunState = {
  status: 'idle',
  summaryText: '',
}

interface RunResultStore {
  lastRun: LastRunState
  setLastRun: (patch: Partial<LastRunState> & { status: RunResultStatus }) => void
  clear: () => void
}

export const useRunResultStore = create<RunResultStore>()((set) => ({
  lastRun: initial,
  setLastRun: (patch) =>
    set((s) => {
      const next: LastRunState = { ...s.lastRun, ...patch }
      if (patch.status !== 'running') {
        next.finishedAt = Date.now()
      }
      return { lastRun: next }
    }),
  clear: () => set({ lastRun: initial }),
}))
