import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkTokenBridge } from './components/ClerkTokenBridge'
import './index.css'
import { useGraphStore } from './store/graphStore'
import { useCorpusStore } from './store/corpusStore'
import { DEFAULT_APP_GRAPH } from './data/defaultAppGraph'
import { TOPOLOGY_DEMO_GRAPH } from './data/topologyDemoGraph'
import { PICK_DEMO_GRAPH } from './data/pickDemoGraph'
import { JOIN_LLM_DEMO_GRAPH } from './data/joinLlmDemoGraph'
import { RAG_DEMO_GRAPH } from './data/ragDemoGraph'
import { AGENT_DEMO_GRAPH } from './data/agentDemoGraph'
import { SAMPLE_COMFY_WORKFLOW } from './data/sampleComfyWorkflow'
import { buildStressGraph } from './data/stressGraph'
import { applyGraph, type SerializedGraph } from './lib/serializeGraph'
import { resetHistoryToCurrent } from './lib/graphHistory'
import { loadGraphFromServer, apiPath } from './lib/serverApi'
import { apiFetch } from './lib/apiFetch'
import { SPAM_DEMO_GRAPH } from './data/spamDemoGraph'
import App from './App'

async function bootstrap() {
  await useCorpusStore.getState().init()

  const p = new URLSearchParams(window.location.search)
  if (p.get('demo') === 'comfy') {
    useGraphStore.getState().loadWorkflow(SAMPLE_COMFY_WORKFLOW)
    resetHistoryToCurrent()
  } else if (p.get('demo') === 'topology') {
    useGraphStore.getState().loadAppGraph(TOPOLOGY_DEMO_GRAPH)
    resetHistoryToCurrent()
  } else if (p.get('demo') === 'pick') {
    useGraphStore.getState().loadAppGraph(PICK_DEMO_GRAPH)
    resetHistoryToCurrent()
  } else if (p.get('demo') === 'joinllm') {
    useGraphStore.getState().loadAppGraph(JOIN_LLM_DEMO_GRAPH)
    resetHistoryToCurrent()
  } else if (p.get('demo') === 'rag') {
    useGraphStore.getState().loadAppGraph(RAG_DEMO_GRAPH)
    resetHistoryToCurrent()
  } else if (p.get('demo') === 'agent') {
    useGraphStore.getState().loadAppGraph(AGENT_DEMO_GRAPH)
    resetHistoryToCurrent()
  } else if (p.get('spamPipeline') != null) {
    // Open the spam-default graph with the given item pre-filled in SpamItemSource.
    // This is the "edit pipeline" entry point from the spam inbox detail view.
    const itemId = p.get('spamPipeline') ?? ''
    try {
      const pRes = await apiFetch(apiPath('/api/spam/pipeline'), {
        headers: { 'X-User-Id': 'dev' },
      })
      if (pRes.ok) {
        const pj = (await pRes.json()) as { graphId?: string }
        if (pj.graphId) {
          // Remember the graph ID so the toolbar can offer "Publish spam policy"
          try { localStorage.setItem('flow-prompt-spam-pipeline-id', pj.graphId) } catch { /* ignore */ }
          const g = await loadGraphFromServer(pj.graphId)
          // Pre-fill SpamItemSource widget with the item UUID
          const nodes = g.nodes.map(([id, node]) => {
            if (id === 'spam-src') {
              const n = node as Record<string, unknown>
              return [id, { ...n, widgetValues: [itemId] }] as [string, unknown]
            }
            return [id, node] as [string, unknown]
          })
          applyGraph({ ...g, nodes })
          resetHistoryToCurrent()
        } else {
          throw new Error('no graphId')
        }
      } else {
        throw new Error('pipeline fetch failed')
      }
    } catch {
      // Fallback: local SPAM_DEMO_GRAPH template with item pre-filled
      const nodes = SPAM_DEMO_GRAPH.nodes.map((n) => {
        if (n.id === 'spam-src') {
          return { ...n, widgetValues: [itemId] }
        }
        return n
      })
      useGraphStore.getState().loadAppGraph({ ...SPAM_DEMO_GRAPH, nodes })
      resetHistoryToCurrent()
    }
  } else {
    const stress = p.get('stress')
    if (stress != null) {
      const n = stress === '' ? 200 : Number(stress)
      const c = Number.isFinite(n) ? n : 200
      useGraphStore.getState().loadAppGraph(buildStressGraph(c))
      resetHistoryToCurrent()
    } else {
      const key = 'flow-prompt-v1'
      const raw = localStorage.getItem(key)
      if (raw) {
        try {
          const data = JSON.parse(raw) as SerializedGraph
          if (data?.version === 1 && data.nodes) {
            applyGraph(data)
            resetHistoryToCurrent()
          } else {
            useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
            resetHistoryToCurrent()
          }
        } catch {
          useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
          resetHistoryToCurrent()
        }
      } else {
        useGraphStore.getState().loadAppGraph(DEFAULT_APP_GRAPH)
        resetHistoryToCurrent()
      }
    }
  }

  useCorpusStore.getState().migrateAppRetrieveNodes()
}

void bootstrap().then(() => {
  const clerkPk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
  const inner = (
    <StrictMode>
      <App />
    </StrictMode>
  )
  createRoot(document.getElementById('root')!).render(
    clerkPk ? (
      <ClerkProvider publishableKey={clerkPk}>
        <ClerkTokenBridge>{inner}</ClerkTokenBridge>
      </ClerkProvider>
    ) : (
      inner
    ),
  )
})
