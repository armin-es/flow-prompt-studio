import type { PortableWorkflow } from '../types'
import type { AppGraphState } from '../data/defaultAppGraph'
import { DEFAULT_APP_GRAPH } from '../data/defaultAppGraph'
import { TOPOLOGY_DEMO_GRAPH } from '../data/topologyDemoGraph'
import { PICK_DEMO_GRAPH } from '../data/pickDemoGraph'
import { JOIN_LLM_DEMO_GRAPH } from '../data/joinLlmDemoGraph'
import { RAG_DEMO_GRAPH } from '../data/ragDemoGraph'
import { AGENT_DEMO_GRAPH } from '../data/agentDemoGraph'
import { SPAM_DEMO_GRAPH } from '../data/spamDemoGraph'
import { SAMPLE_PORTABLE_WORKFLOW } from '../data/samplePortableWorkflow'
import { buildStressGraph } from '../data/stressGraph'

export type TemplateCtx = {
  loadAppGraph: (g: AppGraphState) => void
  loadPortableWorkflow: (w: PortableWorkflow) => void
  resetHistory: () => void
}

export type AppTemplateEntry = {
  id: string
  label: string
  description: string
  category: 'starters' | 'advanced'
  apply: (ctx: TemplateCtx) => void
}

function loadApp(g: AppGraphState) {
  return (ctx: TemplateCtx) => {
    ctx.loadAppGraph(g)
    ctx.resetHistory()
  }
}

/** Extensible list: add entries here instead of new toolbar buttons. */
export const APP_TEMPLATE_ENTRIES: AppTemplateEntry[] = [
  {
    id: 'app-pipeline',
    label: 'App pipeline',
    description: 'Input → LLM → Output (needs API, see README)',
    category: 'starters',
    apply: loadApp(DEFAULT_APP_GRAPH),
  },
  {
    id: 'tee-join',
    label: 'Tee / Join',
    description: 'Fan-out and fan-in over TEXT (no API)',
    category: 'starters',
    apply: loadApp(TOPOLOGY_DEMO_GRAPH),
  },
  {
    id: 'pick',
    label: 'Pick 2→1',
    description: 'Two inputs → pick one → output',
    category: 'starters',
    apply: loadApp(PICK_DEMO_GRAPH),
  },
  {
    id: 'join-llm',
    label: 'Join + LLM',
    description: 'Task + context → Join → LLM → Output',
    category: 'starters',
    apply: loadApp(JOIN_LLM_DEMO_GRAPH),
  },
  {
    id: 'rag',
    label: 'RAG',
    description: 'Retrieve + LLM; BM25 by default',
    category: 'starters',
    apply: loadApp(RAG_DEMO_GRAPH),
  },
  {
    id: 'agent',
    label: 'Agent',
    description: 'Tool nodes + /api/complete/tools',
    category: 'starters',
    apply: loadApp(AGENT_DEMO_GRAPH),
  },
  {
    id: 'spam',
    label: 'Spam pipeline',
    description: 'Spam triage v2: rules + retrieve examples/policy + judge + combine (matches server seed)',
    category: 'starters',
    apply: loadApp(SPAM_DEMO_GRAPH),
  },
  {
    id: 'portable-workflow',
    label: 'Portable workflow',
    description: 'Sample nodes-and-links JSON (diffusion-style demo)',
    category: 'advanced',
    apply: (ctx) => {
      ctx.loadPortableWorkflow(SAMPLE_PORTABLE_WORKFLOW)
      ctx.resetHistory()
    },
  },
  {
    id: 'stress-200',
    label: 'Stress 200 nodes',
    description: 'Performance stress graph (see README)',
    category: 'advanced',
    apply: loadApp(buildStressGraph(200)),
  },
]