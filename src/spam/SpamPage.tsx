import { SpamDetail } from './SpamDetail'
import { SpamInbox } from './SpamInbox'

function itemFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('item')
}

export function SpamPage() {
  const itemId = itemFromLocation()
  return itemId ? <SpamDetail itemId={itemId} /> : <SpamInbox />
}
