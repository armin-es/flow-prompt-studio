import { useEffect, useState } from 'react'
import { AuthGate } from './components/AuthGate'
import { GraphEditor } from './components/GraphEditor'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DialogHost } from './components/DialogHost'
import { SpamPage } from './spam/SpamPage'

function usePathname(): string {
  const [path, setPath] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return path
}

export default function App() {
  const path = usePathname()
  const spam =
    path === '/spam' || path.startsWith('/spam/')

  return (
    <ErrorBoundary>
      <AuthGate>
        {spam ? <SpamPage /> : <GraphEditor />}
      </AuthGate>
      <DialogHost />
    </ErrorBoundary>
  )
}
