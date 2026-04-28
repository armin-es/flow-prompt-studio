import { apiFetch } from './apiFetch'
import { apiUrl } from './completeStream'

export type AgentToolCall = {
  id: string
  name: string
  arguments: string
}

export async function postCompleteTools(
  body: {
    model: string
    messages: unknown[]
    tools: unknown[]
  },
  options?: { signal?: AbortSignal },
): Promise<{ content: string | null; tool_calls: AgentToolCall[] }> {
  const signal = options?.signal
  const payload = {
    model: body.model,
    messages: body.messages,
    tools: body.tools,
  }
  const doFetch = () =>
    apiFetch(apiUrl('/api/complete/tools'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })

  let r = await doFetch()
  if (!r.ok && (r.status === 502 || r.status === 503) && !signal?.aborted) {
    await new Promise((res) => setTimeout(res, 200))
    r = await doFetch()
  }

  let data: {
    content?: string | null
    tool_calls?: AgentToolCall[]
    error?: string
  } = {}
  try {
    data = (await r.json()) as typeof data
  } catch {
    if (!r.ok) throw new Error(r.statusText || 'Request failed')
  }
  if (!r.ok) {
    throw new Error(data.error ?? r.statusText ?? 'Request failed')
  }
  return {
    content: data.content ?? null,
    tool_calls: Array.isArray(data.tool_calls) ? data.tool_calls : [],
  }
}
