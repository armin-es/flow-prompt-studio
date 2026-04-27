import { useHistoryStore } from '../store/historyStore'
import { captureGraph } from './serializeGraph'

export function resetHistoryToCurrent(): void {
  useHistoryStore.getState().resetFrom(captureGraph())
}
