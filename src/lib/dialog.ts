import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertReq = { kind: 'alert'; title?: string; message: string; resolve: () => void }
type ConfirmReq = { kind: 'confirm'; title?: string; message: string; resolve: (v: boolean) => void }
type PromptReq = {
  kind: 'prompt'
  title?: string
  message: string
  defaultValue: string
  resolve: (v: string | null) => void
}
export type DialogReq = AlertReq | ConfirmReq | PromptReq

interface DialogStore {
  queue: DialogReq[]
  /** Push a request; caller awaits the resolve/reject in the DialogReq itself. */
  push: (req: DialogReq) => void
  /** Remove the head of the queue once the user responds. */
  shift: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDialogStore = create<DialogStore>()((set) => ({
  queue: [],
  push: (req) => set((s) => ({ queue: [...s.queue, req] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}))

// ---------------------------------------------------------------------------
// Hook — drop-in replacements for window.alert / confirm / prompt
// ---------------------------------------------------------------------------

export function useDialog() {
  const push = useDialogStore((s) => s.push)

  function alert(message: string, title?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      push({ kind: 'alert', title, message, resolve })
    })
  }

  function confirm(message: string, title?: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      push({ kind: 'confirm', title, message, resolve })
    })
  }

  function prompt(message: string, defaultValue = '', title?: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      push({ kind: 'prompt', title, message, defaultValue, resolve })
    })
  }

  return { alert, confirm, prompt }
}
