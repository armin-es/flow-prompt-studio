import { apiFetch } from './apiFetch'
import type { SseMessage } from './parseSse'

function splitSseBlocks(buffer: string): { rest: string; blocks: string[] } {
  const blocks: string[] = []
  let start = 0
  for (;;) {
    const i = buffer.indexOf('\n\n', start)
    if (i === -1) {
      return { rest: buffer.slice(start), blocks }
    }
    blocks.push(buffer.slice(start, i))
    start = i + 2
  }
}

function parseSseDataLines(block: string): string {
  const lines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('data: ')) {
      lines.push(line.slice(6).trim())
    }
  }
  if (lines.length === 0) {
    return ''
  }
  return lines.join('\n')
}

export function parseSseBlock(block: string): SseMessage {
  const raw = parseSseDataLines(block)
  if (raw.length === 0) {
    return { type: 'empty' as const }
  }
  return JSON.parse(raw) as SseMessage
}

export function apiUrl(
  path: '/api/complete' | '/api/complete/stream' | '/api/embed',
): string {
  const origin = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '')
  return origin ? `${origin}${path}` : path
}

function processSseEvent(
  b: string,
  acc: { s: string },
  onToken: (full: string) => void,
): 'continue' | 'finished' {
  if (!b.trim()) {
    return 'continue'
  }
  const msg = parseSseBlock(b) as SseMessage | { type: 'error'; message: string }
  if (msg.type === 'empty') {
    return 'continue'
  }
  if (msg.type === 'token' && typeof (msg as { text?: string }).text === 'string') {
    const piece = (msg as { text: string }).text
    acc.s += piece
    onToken(acc.s)
    return 'continue'
  }
  if (msg.type === 'error') {
    const m = 'message' in msg && msg.message ? String(msg.message) : 'Stream error'
    throw new Error(m)
  }
  if (msg.type === 'done') {
    return 'finished'
  }
  return 'continue'
}

/**
 * OpenAI stream via POST `/api/complete/stream` (SSE). Calls `onToken` with
 * the full text assembled so far (throttle/rAF in the caller if needed).
 * Returns the final string, trimmed, matching non-streaming behavior.
 */
export async function postCompleteStream(
  body: { prompt: string; system?: string },
  options: { signal: AbortSignal; onToken: (fullText: string) => void },
): Promise<string> {
  const { signal, onToken } = options

  const doFetch = () =>
    apiFetch(apiUrl('/api/complete/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

  let r = await doFetch()
  if (!r.ok && (r.status === 502 || r.status === 503) && !signal.aborted) {
    await new Promise((res) => setTimeout(res, 200))
    r = await doFetch()
  }
  if (!r.ok) {
    let errMsg = r.statusText || 'Request failed'
    try {
      const j = (await r.json()) as { error?: string }
      if (j.error) errMsg = j.error
    } catch {
      // ignore
    }
    throw new Error(errMsg)
  }
  if (!r.body) {
    throw new Error('Response had no body')
  }

  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const acc = { s: '' }

  const drainBuffer = (): boolean => {
    for (;;) {
      const { rest, blocks } = splitSseBlocks(buf)
      if (blocks.length === 0) {
        return false
      }
      buf = rest
      for (const block of blocks) {
        if (processSseEvent(block, acc, onToken) === 'finished') {
          return true
        }
      }
    }
  }

  for (;;) {
    if (signal.aborted) {
      try {
        await reader.cancel()
      } catch {
        // ignore
      }
      throw new DOMException('aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done) {
      buf += dec.decode()
      if (drainBuffer()) {
        return acc.s.trim()
      }
      break
    }
    buf += dec.decode(value, { stream: true })
    if (drainBuffer()) {
      return acc.s.trim()
    }
  }
  if (drainBuffer()) {
    return acc.s.trim()
  }
  if (acc.s.length > 0) {
    return acc.s.trim()
  }
  throw new Error('Stream closed before completion')
}
