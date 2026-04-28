import { useAuth } from '@clerk/clerk-react'
import { useEffect, type ReactNode } from 'react'
import { setClerkTokenGetter } from '../lib/clerkTokenRegistry'

/** Registers Clerk session JWT with `apiFetch` so `/api/*` requests send `Authorization: Bearer`. */
export function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  useEffect(() => {
    setClerkTokenGetter(() => getToken())
    return () => setClerkTokenGetter(null)
  }, [getToken])
  return <>{children}</>
}
