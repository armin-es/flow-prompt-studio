import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const UNNAMED = 'Untitled workflow'

export type WorkflowDocPersisted = {
  serverGraphId: string | null
  displayName: string
}

type WorkflowDocState = WorkflowDocPersisted & {
  /** Matches `graphStore.graphContentRevision` when canvas last aligned with server or explicit baseline */
  lastAlignedRevision: number
  /** The `displayName` as of the last successful server save/open — used to detect name-only edits. */
  savedName: string
  setLastAlignedRevision: (revision: number) => void
  /** After loading from server or choosing a row */
  openServerGraph: (id: string, name: string, revision: number) => void
  /** New graph, template, or import — not yet tied to a server row */
  openLocalGraph: (name: string, revision: number) => void
  setDisplayName: (name: string) => void
  /** Called after a successful server save to mark the current name as clean. */
  markNameSaved: (name: string) => void
  /** Persist display name only (e.g. hydrate from storage) */
  hydrate: (partial: Partial<WorkflowDocPersisted>) => void
}

export const useWorkflowDocStore = create<WorkflowDocState>()(
  persist(
    (set) => ({
      serverGraphId: null,
      displayName: UNNAMED,
      savedName: UNNAMED,
      lastAlignedRevision: 0,
      setLastAlignedRevision: (revision) => set({ lastAlignedRevision: revision }),
      openServerGraph: (id, name, revision) =>
        set({
          serverGraphId: id,
          displayName: name,
          savedName: name,
          lastAlignedRevision: revision,
        }),
      openLocalGraph: (name, revision) =>
        set({
          serverGraphId: null,
          displayName: name,
          savedName: name,
          lastAlignedRevision: revision,
        }),
      setDisplayName: (displayName) => set({ displayName }),
      markNameSaved: (name) => set({ savedName: name }),
      hydrate: (partial) => set(partial),
    }),
    {
      name: 'flow-prompt-workflow-doc-v1',
      partialize: (s): WorkflowDocPersisted => ({
        serverGraphId: s.serverGraphId,
        displayName: s.displayName,
      }),
    },
  ),
)

export function workflowIsDirty(
  graphContentRevision: number,
  lastAlignedRevision: number,
  displayName?: string,
  savedName?: string,
): boolean {
  if (graphContentRevision !== lastAlignedRevision) return true
  if (displayName !== undefined && savedName !== undefined) {
    return displayName.trim() !== savedName.trim()
  }
  return false
}
