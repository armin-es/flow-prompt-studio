import { useEffect, useRef } from 'react'
import { useGraphStore } from '../store/graphStore'
import { captureGraph } from '../lib/serializeGraph'

const KEY = 'flow-prompt-v1'

export function PersistenceManager() {
  /** Browser timer id (`number`); avoids Node `Timeout` vs DOM mismatch in `tsc -b`. */
  const t = useRef<number | undefined>(undefined)
  useEffect(() => {
    return useGraphStore.subscribe((s, p) => {
      if (!p) return
      if (
        s.nodes === p.nodes &&
        s.edges === p.edges &&
        s.selection === p.selection &&
        s.edgeSelection === p.edgeSelection
      ) {
        return
      }
      clearTimeout(t.current)
      t.current = window.setTimeout(() => {
        try {
          const snap = captureGraph()
          localStorage.setItem(KEY, JSON.stringify(snap))
        } catch {
          // quota: ignore
        }
      }, 500)
    })
  }, [])

  return null
}
