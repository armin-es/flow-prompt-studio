import { useEffect, useState } from 'react'
import { SpamDetail } from './SpamDetail'
import { SpamInbox } from './SpamInbox'

function itemFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('item')
}

/** Mirrors `GET /api/spam/items?all=1` — include allowed / decided / dropped. */
function showAllSpamFromLocation(): boolean {
  if (typeof window === 'undefined') return false
  const v = new URLSearchParams(window.location.search).get('all')
  return v === '1' || v === 'true'
}

export function SpamPage() {
  const itemId = itemFromLocation()
  const [showAll, setShowAll] = useState(showAllSpamFromLocation)

  useEffect(() => {
    const sync = () => setShowAll(showAllSpamFromLocation())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return itemId ? <SpamDetail itemId={itemId} /> : <SpamInbox showAll={showAll} />
}
