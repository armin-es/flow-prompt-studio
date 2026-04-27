import { create } from 'zustand'
import type { NodeId } from '../types'

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface NodeOutput {
  type: string
  [key: string]: unknown
}

export interface NodeExecutionState {
  status: NodeStatus
  progress: number
  outputs: Record<number, NodeOutput>
  error?: string
}

interface ExecutionStore {
  nodeStates: Map<NodeId, NodeExecutionState>
  isRunning: boolean
  cancelRequested: boolean
  runAbortController: AbortController | null
  setNodeState: (id: NodeId, patch: Partial<NodeExecutionState>) => void
  resetAll: () => void
  setIsRunning: (v: boolean) => void
  requestCancel: () => void
  clearCancelRequest: () => void
  setRunAbortController: (a: AbortController | null) => void
}

export const useExecutionStore = create<ExecutionStore>()((set, get) => ({
  nodeStates: new Map(),
  isRunning: false,
  cancelRequested: false,
  runAbortController: null,

  setNodeState: (id, patch) =>
    set((s) => {
      const prev = s.nodeStates.get(id) ?? { status: 'idle' as const, progress: 0, outputs: {} }
      const next = new Map(s.nodeStates)
      next.set(id, { ...prev, ...patch })
      return { nodeStates: next }
    }),

  resetAll: () =>
    set({ nodeStates: new Map(), isRunning: false, cancelRequested: false, runAbortController: null }),
  setIsRunning: (v) => set({ isRunning: v }),
  setRunAbortController: (a) => set({ runAbortController: a }),
  requestCancel: () => {
    get().runAbortController?.abort()
    set({ isRunning: false, cancelRequested: true })
  },
  clearCancelRequest: () => set({ cancelRequested: false }),
}))
