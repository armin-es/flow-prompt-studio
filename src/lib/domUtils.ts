/**
 * When true, the user is likely typing; global shortcuts (fit, nudge) should not fire.
 */
export function isTypableFieldFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    const t = el.type
    if (t === 'text' || t === 'search' || t === 'number' || t === 'email' || t === 'password' || t === 'url') {
      return true
    }
  }
  if (el instanceof HTMLElement && el.getAttribute('contenteditable') === 'true') {
    return true
  }
  return false
}
