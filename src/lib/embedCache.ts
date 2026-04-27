import type { EmbedResponse } from './embedClient'

const DB_NAME = 'flow-prompt-embed-v1'
const DB_VERSION = 1
const STORE = 'vecs'
const KEY_PREFIX = 'v1'

type PostEmbed = (
  texts: string[],
  options: { signal: AbortSignal },
) => Promise<EmbedResponse>

/** Must match `OPENAI_EMBED_MODEL` on the server so cache keys stay valid across deploys. */
export function getDefaultEmbedModel(): string {
  return import.meta.env.VITE_OPENAI_EMBED_MODEL ?? 'text-embedding-3-small'
}

const memoryCache = new Map<string, number[]>()

/** For Vitest: memory store persists between tests; clear so mock call counts are predictable. */
export function clearEmbedCacheMemory(): void {
  memoryCache.clear()
}

/**
 * Persist vectors in IndexedDB `flow-prompt-embed-v1`. Off when server sync is on or
 * `VITE_NO_CLIENT_EMBED_IDB=1` — session memory only (no embed DB open / write).
 */
function embedPersistenceUsesIdb(): boolean {
  if (typeof indexedDB === 'undefined') {
    return false
  }
  if (import.meta.env.VITE_SYNC_SERVER === '1') {
    return false
  }
  if (import.meta.env.VITE_NO_CLIENT_EMBED_IDB === '1') {
    return false
  }
  return true
}

function assertVec(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === 'number'
}

export async function sha256Hex(utf8: string): Promise<string> {
  const data = new TextEncoder().encode(utf8)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function embeddingCacheId(model: string, text: string): Promise<string> {
  return `${KEY_PREFIX}:${await sha256Hex(`${model}\0${text}`)}`
}

let dbOpen: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  if (!embedPersistenceUsesIdb()) {
    return Promise.reject(new Error('openDb called when embed IDB is disabled'))
  }
  if (dbOpen) {
    return dbOpen
  }
  dbOpen = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbOpen
}

async function idbGetMany(ids: string[]): Promise<(number[] | undefined)[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const out: (number[] | undefined)[] = new Array(ids.length)
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    let left = ids.length
    if (left === 0) {
      resolve(out)
      return
    }
    for (let i = 0; i < ids.length; i++) {
      const r = st.get(ids[i]!)
      r.onsuccess = () => {
        const raw = r.result as { v?: number; vector?: unknown } | undefined
        out[i] =
          raw?.v === 1 && assertVec(raw.vector) ? raw.vector : undefined
        left--
        if (left === 0) {
          resolve(out)
        }
      }
      r.onerror = () => reject(r.error)
    }
  })
}

async function idbPutMany(entries: { id: string; vector: number[] }[]): Promise<void> {
  if (entries.length === 0) {
    return
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    for (const e of entries) {
      st.put({ v: 1, vector: e.vector }, e.id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function readCachedVectors(ids: string[]): Promise<(number[] | undefined)[]> {
  if (!embedPersistenceUsesIdb()) {
    return ids.map((id) => memoryCache.get(id))
  }
  return idbGetMany(ids)
}

async function writeCachedVectors(
  items: { id: string; vector: number[] }[],
): Promise<void> {
  if (!embedPersistenceUsesIdb()) {
    for (const { id, vector } of items) {
      memoryCache.set(id, vector)
    }
    return
  }
  return idbPutMany(items)
}

/**
 * Resolves one embedding per input text, in order. **Skips the network** when a
 * SHA-256 key of `model + text` is already cached (IndexedDB unless disabled, else in-memory).
 */
export async function getEmbeddingsCached(
  texts: string[],
  postEmbed: PostEmbed,
  signal: AbortSignal,
): Promise<EmbedResponse> {
  if (texts.length === 0) {
    return { vectors: [] }
  }
  const model = getDefaultEmbedModel()
  const ids = await Promise.all(texts.map((t) => embeddingCacheId(model, t)))
  const cached = await readCachedVectors(ids)
  const out: (number[] | undefined)[] = new Array(texts.length)
  const toFetch: { i: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    const c = cached[i]
    if (c != null) {
      out[i] = c
    } else {
      toFetch.push({ i, text: texts[i]! })
    }
  }
  if (toFetch.length === 0) {
    return { vectors: out as number[][] }
  }
  const res = await postEmbed(
    toFetch.map((x) => x.text),
    { signal },
  )
  if (res.vectors == null) {
    return res
  }
  if (res.vectors.length !== toFetch.length) {
    return { vectors: null, reason: 'count-mismatch' }
  }
  const writes: { id: string; vector: number[] }[] = []
  for (let j = 0; j < toFetch.length; j++) {
    const { i } = toFetch[j]!
    const v = res.vectors[j]!
    out[i] = v
    writes.push({ id: ids[i]!, vector: v })
  }
  await writeCachedVectors(writes)
  return { vectors: out as number[][] }
}
