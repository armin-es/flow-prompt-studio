import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useGraphStore } from './store/graphStore'
import { useCorpusStore } from './store/corpusStore'
import { DEFAULT_APP_GRAPH } from './data/defaultAppGraph'
import { TOPOLOGY_DEMO_GRAPH } from './data/topologyDemoGraph'
import { PICK_DEMO_GRAPH } from './data/pickDemoGraph'
import { JOIN_LLM_DEMO_GRAPH } from './data/joinLlmDemoGraph'
import { RAG_DEMO_GRAPH } from './data/ragDemoGraph'
import { SAMPLE_COMFY_WORKFLOW } from './data/sampleComfyWorkflow'
import { buildStressGraph } from './data/stressGraph'
import { applyGraph, type SerializedGraph } from './lib/serializeGraph'
import { resetHistoryToCurrent } from './lib/graphHistory'
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
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
