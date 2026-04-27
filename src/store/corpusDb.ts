import type { CorpusEntry } from './corpusTypes'

const DB_NAME = 'flow-prompt-corpora-v1'
const DB_VERSION = 1
const STORE = 'corpora'

const mem = new Map<string, CorpusEntry>()

const useIdb = typeof indexedDB !== 'undefined'

let dbOpen: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  if (!useIdb) {
    return Promise.reject(new Error('IndexedDB not available'))
  }
  if (dbOpen) {
    return dbOpen
  }
  dbOpen = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbOpen
}

export function clearCorpusDbMem(): void {
  mem.clear()
}

export async function readAllCorporaFromDb(): Promise<CorpusEntry[]> {
  if (!useIdb) {
    return [...mem.values()]
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const r = st.getAll()
    r.onsuccess = () => {
      const rows = (r.result ?? []) as CorpusEntry[]
      resolve(rows)
    }
    r.onerror = () => reject(r.error)
  })
}

export async function writeCorpusToDb(e: CorpusEntry): Promise<void> {
  if (!useIdb) {
    mem.set(e.id, { ...e })
    return
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    st.put(e)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteCorpusFromDb(id: string): Promise<void> {
  if (!useIdb) {
    mem.delete(id)
    return
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    st.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
