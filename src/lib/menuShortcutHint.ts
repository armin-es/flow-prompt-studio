/** Shown in UI for toggling the app menu (templates, file, spam). */
export function menuShortcutHint(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+Shift+M'
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform ?? '') ? 'Cmd+Shift+M' : 'Ctrl+Shift+M'
}

/** Save shortcut for button titles / tooltips. */
export function saveShortcutTitle(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+S'
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform ?? '') ? 'Cmd+S' : 'Ctrl+S'
}
