import { create } from 'zustand'
import { DEFAULT_RETRIEVE_CORPUS } from '../data/defaultRetrieveCorpus'
import { useGraphStore } from './graphStore'
import {
  clearCorpusDbMem,
  deleteCorpusFromDb,
  readAllCorporaFromDb,
  writeCorpusToDb,
} from './corpusDb'
import {
  deleteServerCorpus,
  fetchServerCorpora,
  serverSyncEnabled,
  syncCorpusToServer,
} from '../lib/serverApi'
import type { CorpusEntry } from './corpusTypes'

const DEFAULT_ID = 'corpus-default'
const ID_RE = /^corpus-[a-z0-9-]+$/

function now(): number {
  return Date.now()
}

type CorpusState = {
  ready: boolean
  byId: Record<string, CorpusEntry>
  init: () => Promise<void>
  /** Merges server corpora (when VITE_SYNC_SERVER=1) into IndexedDB; newer `updatedAt` wins. */
  pullFromServerIfEnabled: () => Promise<void>
  getBody: (id: string) => string
  getEntry: (id: string) => CorpusEntry | undefined
  /** Bumps when corpus `id` body or meta changes; used in partial-run stamp. */
  getStampPart: (id: string) => string
  list: () => CorpusEntry[]
  upsert: (id: string, name: string, body: string) => void
  create: (name: string, body: string) => string
  remove: (id: string) => void
  /** After loading a graph: inline corpus text → named corpus + widget = id. */
  migrateAppRetrieveNodes: () => void
}

function sortEntries(entries: CorpusEntry[]): CorpusEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function isValidCorpusId(s: string): boolean {
  return ID_RE.test(s)
}

/**
 * `widgetValues[1]` held full pasted text. Now it holds a corpus id only.
 * Anything that is not a valid id, or a valid id with no entry (shouldn’t
 * happen), is treated as legacy body text and moved to a per-node slug.
 */
export const useCorpusStore = create<CorpusState>()((set, get) => ({
  ready: false,
  byId: {},

  getBody: (id) => get().byId[id]?.body ?? '',

  getEntry: (id) => get().byId[id],

  getStampPart: (id) => {
    const e = get().byId[id]
    if (e == null) {
      return `missing:${id}`
    }
    return `${e.id}\0${e.updatedAt}\0${e.body.length}`
  },

  list: () => sortEntries(Object.values(get().byId)),

  init: async () => {
    if (get().ready) {
      return
    }
    const rows: CorpusEntry[] = await readAllCorporaFromDb().catch(
      () => [] as CorpusEntry[],
    )
    const byId: Record<string, CorpusEntry> = {}
    for (const e of rows) {
      byId[e.id] = e
    }
    if (byId[DEFAULT_ID] == null) {
      const e: CorpusEntry = {
        id: DEFAULT_ID,
        name: 'Default',
        body: DEFAULT_RETRIEVE_CORPUS,
        updatedAt: now(),
      }
      byId[DEFAULT_ID] = e
      await writeCorpusToDb(e)
    }
    set({ byId, ready: true })
    await get().pullFromServerIfEnabled()
  },

  pullFromServerIfEnabled: async () => {
    if (!serverSyncEnabled()) {
      return
    }
    const remote = await fetchServerCorpora().catch(() => null)
    if (remote === null) {
      // API down or DB not configured — do not overwrite or push; IndexedDB is source of truth.
      return
    }
    if (remote.length > 0) {
      const byId: Record<string, CorpusEntry> = { ...get().byId }
      for (const c of remote) {
        const serverT = new Date(c.updatedAt).getTime()
        const local = byId[c.id]
        if (local != null && local.updatedAt > serverT) {
          continue
        }
        const e: CorpusEntry = {
          id: c.id,
          name: c.name,
          body: c.body,
          updatedAt: serverT,
        }
        byId[c.id] = e
        void writeCorpusToDb(e)
      }
      set({ byId })
      return
    }
    // Server is reachable and has no corpora: push local IndexedDB state once per load
    for (const e of sortEntries(Object.values(get().byId))) {
      void syncCorpusToServer(e).catch(() => {
        // ignore per-corpus errors (e.g. still 503)
      })
    }
  },

  upsert: (id, name, body) => {
    const t = now()
    const e: CorpusEntry = { id, name, body, updatedAt: t }
    set((s) => ({ byId: { ...s.byId, [id]: e } }))
    void writeCorpusToDb(e)
    if (serverSyncEnabled()) {
      void syncCorpusToServer(e).catch(() => {
        /* server down or not migrated */
      })
    }
  },

  create: (name, body) => {
    const id = `corpus-${Date.now().toString(36)}`
    get().upsert(id, name, body)
    return id
  },

  remove: (id) => {
    if (id === DEFAULT_ID) {
      return
    }
    const cur = get().byId
    if (cur[id] == null || Object.keys(cur).length <= 1) {
      return
    }
    const next = { ...cur }
    delete next[id]
    set({ byId: next })
    void deleteCorpusFromDb(id)
    if (serverSyncEnabled()) {
      void deleteServerCorpus(id).catch(() => {})
    }
    // Rewire any Retrieve node using this id
    const nodes = new Map(useGraphStore.getState().nodes)
    for (const [nid, n] of nodes) {
      if (n.type !== 'AppRetrieve') {
        continue
      }
      if (String(n.widgetValues[1] ?? '') !== id) {
        continue
      }
      const wv = [...n.widgetValues]
      wv[1] = DEFAULT_ID
      nodes.set(nid, { ...n, widgetValues: wv })
    }
    useGraphStore.setState({ nodes })
  },

  migrateAppRetrieveNodes: () => {
    const byId: Record<string, CorpusEntry> = { ...get().byId }
    const nodes = new Map(useGraphStore.getState().nodes)
    let changed = false
    for (const [nid, n] of nodes) {
      if (n.type !== 'AppRetrieve') {
        continue
      }
      const w1 = String(n.widgetValues[1] ?? '')
      if (isValidCorpusId(w1) && byId[w1] != null) {
        continue
      }
      if (w1.length === 0) {
        const wv = [...n.widgetValues]
        wv[1] = DEFAULT_ID
        nodes.set(nid, { ...n, widgetValues: wv })
        changed = true
        continue
      }
      if (isValidCorpusId(w1) && byId[w1] == null) {
        const wv = [...n.widgetValues]
        wv[1] = DEFAULT_ID
        nodes.set(nid, { ...n, widgetValues: wv })
        changed = true
        continue
      }
      const mid = `corpus-legacy-${nid}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 64)
      const e: CorpusEntry = {
        id: mid,
        name: 'Migrated',
        body: w1,
        updatedAt: now(),
      }
      byId[mid] = e
      void writeCorpusToDb(e)
      const wv = [...n.widgetValues]
      wv[1] = mid
      nodes.set(nid, { ...n, widgetValues: wv })
      changed = true
    }
    if (changed) {
      set({ byId })
      useGraphStore.setState({ nodes })
    }
  },
}))

export { DEFAULT_ID as CORPUS_DEFAULT_ID }

export function __clearCorpusStoreForTests(): void {
  clearCorpusDbMem()
  useCorpusStore.setState({ ready: false, byId: {} })
}
