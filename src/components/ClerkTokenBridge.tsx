import { useAuth } from '@clerk/clerk-react'
import { useEffect, type ReactNode } from 'react'
import { serverSyncEnabled } from '../lib/serverApi'
import { setClerkTokenGetter } from '../lib/clerkTokenRegistry'
import { useCorpusStore } from '../store/corpusStore'

/** Registers Clerk session JWT with `apiFetch` so `/api/*` requests send `Authorization: Bearer`. */
export function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    setClerkTokenGetter(() => getToken())
    return () => setClerkTokenGetter(null)
  }, [getToken])

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !serverSyncEnabled()) {
      return
    }
    void useCorpusStore.getState().pullFromServerIfEnabled()
  }, [isLoaded, isSignedIn])

  return <>{children}</>
}
