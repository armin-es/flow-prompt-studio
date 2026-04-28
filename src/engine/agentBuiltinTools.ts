import { chunkCorpus, formatCitationLabel } from './retrieve/chunk'
import { useCorpusStore } from '../store/corpusStore'
import { rankChunksForQuery } from './retrieve/rankRetrieve'
import type { AgentToolCall } from '../lib/completeToolsClient'
import type { ToolsPayload } from '../lib/toolsPayload'

export type BuiltinToolResult = {
  ok: boolean
  text: string
  summary: string
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) {
    return {}
  }
  try {
    const v = JSON.parse(raw) as unknown
    return typeof v === 'object' && v != null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Allowed HTTPS origins only; no localhost/private IPs. */
export function isAllowedHttpGetUrl(urlStr: string): boolean {
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') {
    return false
  }
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    return false
  }
  return true
}

const MAX_HTTP_BYTES = 1_048_576

function evalCalcExpression(expr: string): number {
  const s = expr.replace(/\s+/g, '')
  if (!/^[-+*/().\d]+$/.test(s)) {
    throw new Error('Expression may only contain digits and + - * / ( ).')
  }
  let i = 0
  function peek(): string {
    return s[i] ?? ''
  }
  function eat(ch: string) {
    if (peek() !== ch) throw new Error('Invalid expression')
    i++
  }
  function parseNumber(): number {
    const start = i
    while (/\d/.test(peek())) i++
    if (peek() === '.') {
      i++
      while (/\d/.test(peek())) i++
    }
    if (start === i) throw new Error('Expected number')
    return Number(s.slice(start, i))
  }
  function parseFactor(): number {
    if (peek() === '(') {
      eat('(')
      const v = parseExpr()
      eat(')')
      return v
    }
    if (peek() === '-' || peek() === '+') {
      const sign = peek() === '-' ? -1 : 1
      eat(peek())
      return sign * parseFactor()
    }
    return parseNumber()
  }
  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = peek()
      eat(op)
      const rhs = parseFactor()
      if (op === '*') v *= rhs
      else {
        if (rhs === 0) throw new Error('Division by zero')
        v /= rhs
      }
    }
    return v
  }
  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = peek()
      eat(op)
      const rhs = parseTerm()
      if (op === '+') v += rhs
      else v -= rhs
    }
    return v
  }
  const out = parseExpr()
  if (i !== s.length) throw new Error('Unexpected trailing characters')
  return out
}

async function runRetrieve(
  args: Record<string, unknown>,
  extras: { corpusId?: string } | undefined,
  signal: AbortSignal,
): Promise<BuiltinToolResult> {
  const query = String(args.query ?? args.q ?? '').trim()
  if (!query) {
    return { ok: false, text: 'Missing query', summary: 'missing query' }
  }
  const corpusId = String(extras?.corpusId ?? 'corpus-default').trim()
  const corpus = useCorpusStore.getState().getBody(corpusId)
  if (corpus.length === 0) {
    return {
      ok: false,
      text: 'Corpus is empty for this tool.',
      summary: 'empty corpus',
    }
  }
  const k = Math.min(
    10,
    Math.max(1, Math.floor(Number(args.k ?? args.top_k ?? 3) || 3)),
  )
  const chunkSize = 800
  const chunkOverlap = 100
  const chunks = chunkCorpus(corpus, { chunkSize, chunkOverlap })
  if (chunks.length === 0) {
    return { ok: false, text: 'No chunks.', summary: 'no chunks' }
  }
  const { rows, fallbackNote } = await rankChunksForQuery(
    query,
    chunks,
    'bm25',
    signal,
  )
  const top = rows.slice(0, k)
  const head =
    fallbackNote != null ? `[retrieval: ${fallbackNote}]\n\n` : ''
  const body = top
    .map((r, i) => {
      const n = i + 1
      return `Passage [${n}] — ${formatCitationLabel(r)} (score ${r.score.toFixed(4)})\n${r.text}`
    })
    .join('\n\n---\n\n')
  const text = head + body
  return {
    ok: true,
    text,
    summary: `${top.length} passage(s)`,
  }
}

async function runHttpGet(
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<BuiltinToolResult> {
  const urlStr = String(args.url ?? '').trim()
  if (!urlStr) {
    return { ok: false, text: 'Missing url', summary: 'missing url' }
  }
  if (!isAllowedHttpGetUrl(urlStr)) {
    return {
      ok: false,
      text: 'URL not allowed (HTTPS only; no localhost/private hosts).',
      summary: 'blocked url',
    }
  }
  const res = await fetch(urlStr, {
    method: 'GET',
    signal,
    headers: { Accept: 'text/plain,text/html,application/json;q=0.9,*/*;q=0.8' },
  })
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_HTTP_BYTES) {
    return {
      ok: false,
      text: `Response too large (>${MAX_HTTP_BYTES} bytes).`,
      summary: 'too large',
    }
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  const slice = text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text
  return {
    ok: res.ok,
    text: `HTTP ${res.status}\n\n${slice}`,
    summary: `HTTP ${res.status}, ${buf.byteLength} B`,
  }
}

function runCalc(args: Record<string, unknown>): BuiltinToolResult {
  const expr = String(args.expr ?? args.expression ?? '').trim()
  if (!expr) {
    return { ok: false, text: 'Missing expr', summary: 'missing expr' }
  }
  try {
    const n = evalCalcExpression(expr)
    const text = String(n)
    return { ok: true, text, summary: text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, text: msg, summary: 'error' }
  }
}

function runEcho(args: Record<string, unknown>): BuiltinToolResult {
  const text = JSON.stringify(args)
  return { ok: true, text, summary: text.length > 80 ? `${text.slice(0, 80)}…` : text }
}

export async function runBuiltinTool(
  call: AgentToolCall,
  registry: ToolsPayload,
  signal: AbortSignal,
): Promise<BuiltinToolResult> {
  const binding = registry.implByName[call.name]
  if (!binding) {
    return {
      ok: false,
      text: `Unknown tool "${call.name}" (not in graph registry).`,
      summary: 'unknown tool',
    }
  }
  const args = parseArgs(call.arguments)

  if (signal.aborted) {
    throw new DOMException('aborted', 'AbortError')
  }

  switch (binding.impl) {
    case 'retrieve':
      return runRetrieve(args, binding, signal)
    case 'http_get':
      return runHttpGet(args, signal)
    case 'calc':
      return runCalc(args)
    case 'echo':
      return runEcho(args)
    default: {
      const _x: never = binding.impl
      return {
        ok: false,
        text: `Unsupported impl ${_x}`,
        summary: 'bad impl',
      }
    }
  }
}
