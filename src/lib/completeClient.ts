import { apiFetch } from './apiFetch'
import { apiUrl } from './completeStream'

export async function postComplete(
  body: { prompt: string; system?: string },
  options?: { signal?: AbortSignal },
): Promise<string> {
  const signal = options?.signal
  const doFetch = () =>
    apiFetch(apiUrl('/api/complete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

  let r = await doFetch()
  if (!r.ok && (r.status === 502 || r.status === 503) && !signal?.aborted) {
    await new Promise((res) => setTimeout(res, 200))
    r = await doFetch()
  }
  let data: { text?: string; error?: string } = {}
  try {
    data = (await r.json()) as { text?: string; error?: string }
  } catch {
    if (!r.ok) throw new Error(r.statusText || 'Request failed')
  }
  if (!r.ok) {
    throw new Error(data.error ?? (r.statusText || 'Request failed'))
  }
  if (data.text == null) {
    throw new Error('Response missing `text`')
  }
  return data.text
}
