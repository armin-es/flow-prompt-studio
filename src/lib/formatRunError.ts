/**
 * Slightly kinder copy for the Last run panel; keeps the original message.
 */
export function formatRunErrorForUser(message: string): string {
  if (/OPENAI|openai|API key|401|404|429|502|503|network/i.test(message)) {
    if (!/check|server|key/i.test(message)) {
      return `${message} — Check the API server, OPENAI_API_KEY, and network.`
    }
  }
  if (/aborted|AbortError/i.test(message)) {
    return 'Request was cancelled (Escape or Stop).'
  }
  if (/Stream closed before completion/i.test(message)) {
    return `${message} The stream ended early; try again or check the API.`
  }
  return message
}
