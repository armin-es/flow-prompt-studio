/** User-role suffix for Stage B LLM calls (retrieval + schema hints). Appended after graph-built prompt when running on the server. */
export function buildStageBUserMessageSuffix(userPayload: Record<string, unknown>): string {
  return (
    `Task: classify the post as ham, spam, or unsure.\n\n` +
    `JSON keys: verdict (ham|spam|unsure), confidence (0..1), rationale (short), ` +
    `citedExample (substring from nearest_spam_examples[0].excerpt if you relied on it, else ""), ` +
    `citedPolicy (substring from policy_chunks[0].excerpt if you relied on it, else "").\n\n` +
    JSON.stringify(userPayload)
  )
}
