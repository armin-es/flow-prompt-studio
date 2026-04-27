import { AuthGate } from './components/AuthGate'
import { GraphEditor } from './components/GraphEditor'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <GraphEditor />
      </AuthGate>
    </ErrorBoundary>
  )
}
