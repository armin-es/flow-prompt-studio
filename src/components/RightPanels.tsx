import { NodeInspector } from './NodeInspector'
import { RunResultPanel } from './RunResultPanel'

export function RightPanels() {
  return (
    <div className="right-panels">
      <NodeInspector />
      <RunResultPanel />
    </div>
  )
}
