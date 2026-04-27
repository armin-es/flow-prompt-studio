import type { SerializedGraph } from './serializeGraph'
import type { CorpusEntry } from '../store/corpusTypes'
import { apiFetch } from './apiFetch'

const USER_HEADER = { 'X-User-Id': 'dev' }

const LS_SERVER_GRAPH = 'flow-prompt-server-graph-id'

export function getLastServerGraphId(): string | null {
  try {
    return localStorage.getItem(LS_SERVER_GRAPH)
  } catch {
    return null
  }
}

function rememberServerGraphId(id: string) {
  try {
    localStorage.setItem(LS_SERVER_GRAPH, id)
  } catch {
    // ignore
  }
}

function publicHeaders(json: boolean): Record<string, string> {
  return json
    ? { ...USER_HEADER, 'Content-Type': 'application/json' }
    : { ...USER_HEADER }
}

/**
 * In dev, the Vite proxy serves `/api` on the same origin; in production, set
 * `VITE_API_ORIGIN` to the Hono base URL (no path).
 */
export function apiPath(path: string): string {
  const origin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') ?? ''
  return origin ? `${origin}${path}` : path
}

export function serverSyncEnabled(): boolean {
  return import.meta.env.VITE_SYNC_SERVER === '1'
}

export function serverCosineRetrieveEnabled(): boolean {
  return import.meta.env.VITE_SERVER_COSINE_RETRIEVE === '1'
}

/** When true, AppRetrieve in cosine mode uses `POST /api/retrieve` first (no client chunk/query embed cache for that run). */
export function preferServerCosineRetrieval(): boolean {
  return serverSyncEnabled() || serverCosineRetrieveEnabled()
}

/**
 * If `1`, failed server retrieve falls back to in-browser cosine (IndexedDB `flow-prompt-embed-v1` may grow).
 * Default is **off** so server-backed setups do not silently fill the client embed cache.
 */
export function cosineClientFallbackEnabled(): boolean {
  return import.meta.env.VITE_COSINE_CLIENT_FALLBACK === '1'
}

type ServerCorpus = {
  id: string
  name: string
  body: string
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
}

/**
 * Fetches all corpora for the dev user.
 * - `null` = request failed (offline, no `DATABASE_URL`, 503) — do not treat as “empty server”.
 * - `[]` = server is reachable and has zero rows (safe to seed from IndexedDB on first sync).
 */
export async function fetchServerCorpora(): Promise<ServerCorpus[] | null> {
  const res = await apiFetch(apiPath('/api/corpora'), {
    headers: publicHeaders(false),
  })
  if (!res.ok) {
    return null
  }
  const j = (await res.json()) as { corpora?: ServerCorpus[] }
  return j.corpora ?? []
}

/**
 * Pushes a corpus to Postgres (rechunks on the server). Uses PUT, then POST
 * if the corpus does not exist yet.
 */
export async function syncCorpusToServer(entry: CorpusEntry): Promise<void> {
  const body = {
    name: entry.name,
    body: entry.body,
    chunkSize: 800,
    chunkOverlap: 20,
  }
  const put = await apiFetch(apiPath(`/api/corpora/${encodeURIComponent(entry.id)}`), {
    method: 'PUT',
    headers: publicHeaders(true),
    body: JSON.stringify(body),
  })
  if (put.status === 404) {
    const post = await apiFetch(apiPath('/api/corpora'), {
      method: 'POST',
      headers: publicHeaders(true),
      body: JSON.stringify({ id: entry.id, ...body }),
    })
    if (!post.ok) {
      const t = await post.text()
      throw new Error(t || `POST /api/corpora ${post.status}`)
    }
    return
  }
  if (!put.ok) {
    const t = await put.text()
    throw new Error(t || `PUT /api/corpora ${put.status}`)
  }
}

export async function deleteServerCorpus(id: string): Promise<void> {
  const res = await apiFetch(apiPath(`/api/corpora/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: publicHeaders(false),
  })
  if (!res.ok && res.status !== 404) {
    const t = await res.text()
    throw new Error(t || `DELETE /api/corpora ${res.status}`)
  }
}

type RetrieveRow = {
  text: string
  source: string
  docTitle: string
  partIndex: number
  score: number
}

/** Saves a Flow v1 graph snapshot to the API (see `POST /api/graphs`). Returns the graph UUID. */
export async function saveGraphToServer(
  data: SerializedGraph,
  name: string = 'Graph',
): Promise<string> {
  const res = await apiFetch(apiPath('/api/graphs'), {
    method: 'POST',
    headers: publicHeaders(true),
    body: JSON.stringify({ name, data }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `POST /api/graphs ${res.status}`)
  }
  const j = (await res.json()) as { graph: { id: string } }
  const id = j.graph.id
  rememberServerGraphId(id)
  return id
}

export async function loadGraphFromServer(id: string): Promise<SerializedGraph> {
  const res = await apiFetch(apiPath(`/api/graphs/${encodeURIComponent(id)}`), {
    headers: publicHeaders(false),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `GET /api/graphs ${res.status}`)
  }
  const j = (await res.json()) as { graph: { data: SerializedGraph } }
  return j.graph.data
}

/**
 * Server-side pgvector retrieve (cosine). Requires a synced corpus with embedded chunks
 * (server auto-embeds after save when OPENAI_API_KEY is set, or `POST /api/corpora/:id/embed`).
 * Query embedding runs on the server only.
 */
export async function retrieveFromServer(
  corpusId: string,
  query: string,
  k: number,
  signal: AbortSignal,
): Promise<{ rows: RetrieveRow[]; fallbackNote: string | null }> {
  const res = await apiFetch(apiPath('/api/retrieve'), {
    method: 'POST',
    headers: publicHeaders(true),
    body: JSON.stringify({
      corpusId,
      query,
      k,
      mode: 'cosine',
    }),
    signal,
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `POST /api/retrieve ${res.status}`)
  }
  return (await res.json()) as { rows: RetrieveRow[]; fallbackNote: string | null }
}
