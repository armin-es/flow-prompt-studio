import { useGraphStore } from '../store/graphStore'
import { useWireStore } from '../store/wireStore'
import { useHistoryStore } from '../store/historyStore'

/**
 * If a wire is active, try to connect to this input. Returns true if a new edge was added.
 */
export function tryCompleteWireTo(
  targetNodeId: string,
  targetPortIndex: number,
): boolean {
  const w = useWireStore.getState().wire
  if (!w) return false

  const s = useGraphStore.getState()
  const from = s.nodes.get(w.sourceNodeId)
  const to = s.nodes.get(targetNodeId)
  if (!from || !to) {
    useWireStore.getState().end()
    return false
  }
  if (w.sourceNodeId === targetNodeId) {
    useWireStore.getState().end()
    return false
  }
  const so = from.outputs[w.sourcePortIndex]
  const ti = to.inputs[targetPortIndex]
  if (so && ti && so.dataType !== ti.dataType) {
    useWireStore.getState().end()
    return false
  }

  const id = `edge-${crypto.randomUUID().slice(0, 8)}`
  const ok = s.addEdge({
    id,
    sourceNodeId: w.sourceNodeId,
    sourcePortIndex: w.sourcePortIndex,
    targetNodeId,
    targetPortIndex,
  })
  useWireStore.getState().end()
  if (ok) {
    useHistoryStore.getState().commit()
  }
  return ok
}

export function cancelWireIfAny(): void {
  useWireStore.getState().end()
}
