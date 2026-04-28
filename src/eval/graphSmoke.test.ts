/**
 * Preset smoke tests: deterministic checks on the same executor paths as
 * ?demo=rag and ?demo=agent (no HTTP for LLM/agent — mocks only).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_DEMO_GRAPH } from '../data/agentDemoGraph'
import { RAG_DEMO_GRAPH } from '../data/ragDemoGraph'
import { getExecutor } from '../engine/executors'
import type { GraphNode } from '../types'
import type { NodeOutput } from '../store/executionStore'
import { postCompleteTools } from '../lib/completeToolsClient'
import { useCorpusStore, __clearCorpusStoreForTests } from '../store/corpusStore'

vi.mock('../lib/completeClient', () => ({
  postComplete: vi.fn(() =>
    Promise.resolve('[eval-mock] LLM answered without calling the network.'),
  ),
}))

vi.mock('../lib/completeToolsClient', () => ({
  postCompleteTools: vi.fn(),
}))

const postCompleteToolsMock = vi.mocked(postCompleteTools)

const signal = new AbortController().signal
const noProg = () => {}

function nodeById(graph: { nodes: GraphNode[] }, id: string): GraphNode {
  const n = graph.nodes.find((x) => x.id === id)
  if (!n) throw new Error(`missing node ${id}`)
  return n
}

beforeAll(async () => {
  __clearCorpusStoreForTests()
  await useCorpusStore.getState().init()
})

describe('preset: RAG demo graph (executors)', () => {
  it('chains Input → Tee → Retrieve → Join with BM25 passages', async () => {
    const input = nodeById(RAG_DEMO_GRAPH, 'rag-input')
    const tee = nodeById(RAG_DEMO_GRAPH, 'rag-tee')
    const ret = nodeById(RAG_DEMO_GRAPH, 'rag-ret')
    const join = nodeById(RAG_DEMO_GRAPH, 'rag-join')

    const inOut = await getExecutor('AppInput')(input, {}, noProg, { signal })
    const teeOut = await getExecutor('AppTee')(tee, { 0: inOut[0] }, noProg, {
      signal,
    })
    const retOut = await getExecutor('AppRetrieve')(
      ret,
      { 0: teeOut[0] },
      noProg,
      { signal },
    )
    const joinOut = await getExecutor('AppJoin')(
      join,
      { 0: teeOut[1], 1: retOut[0] },
      noProg,
      { signal },
    )

    const merged = String((joinOut[0] as NodeOutput & { text?: string }).text ?? '')
    expect(merged).toMatch(/Passage\s*\[1\]/)
    expect(merged).toMatch(/BM25/i)
    expect(merged).toMatch(/Context/i)
  })

  it('feeds Join output into AppLlm (mocked completion)', async () => {
    const input = nodeById(RAG_DEMO_GRAPH, 'rag-input')
    const tee = nodeById(RAG_DEMO_GRAPH, 'rag-tee')
    const ret = nodeById(RAG_DEMO_GRAPH, 'rag-ret')
    const join = nodeById(RAG_DEMO_GRAPH, 'rag-join')
    const llm = nodeById(RAG_DEMO_GRAPH, 'rag-llm')

    const inOut = await getExecutor('AppInput')(input, {}, noProg, { signal })
    const teeOut = await getExecutor('AppTee')(tee, { 0: inOut[0] }, noProg, {
      signal,
    })
    const retOut = await getExecutor('AppRetrieve')(
      ret,
      { 0: teeOut[0] },
      noProg,
      { signal },
    )
    const joinOut = await getExecutor('AppJoin')(
      join,
      { 0: teeOut[1], 1: retOut[0] },
      noProg,
      { signal },
    )
    const llmOut = await getExecutor('AppLlm')(
      llm,
      { 0: joinOut[0] },
      noProg,
      { signal },
    )

    const answer = String((llmOut[0] as NodeOutput & { text?: string }).text ?? '')
    expect(answer).toContain('[eval-mock]')
  })
})

describe('preset: Agent demo graph (executors)', () => {
  beforeEach(() => {
    postCompleteToolsMock.mockReset()
  })

  it('merges AppTool outputs and runs AppAgent with no tool calls', async () => {
    postCompleteToolsMock.mockResolvedValueOnce({
      content: 'BM25 is a lexical ranking function.',
      tool_calls: [],
    })

    const toolRet = nodeById(AGENT_DEMO_GRAPH, 'agent-tool-retrieve')
    const toolEcho = nodeById(AGENT_DEMO_GRAPH, 'agent-tool-echo')
    const join = nodeById(AGENT_DEMO_GRAPH, 'agent-tools-join')
    const agent = nodeById(AGENT_DEMO_GRAPH, 'agent-node')
    const question = nodeById(AGENT_DEMO_GRAPH, 'agent-input')

    const a = await getExecutor('AppTool')(toolRet, {}, noProg, { signal })
    const b = await getExecutor('AppTool')(toolEcho, {}, noProg, { signal })
    const tools = await getExecutor('AppToolsJoin')(
      join,
      { 0: a[0], 1: b[0] },
      noProg,
      { signal },
    )

    expect((tools[0] as { type?: string }).type).toBe('TOOLS')
    expect(String((tools[0] as { tools?: { function?: { name?: string } }[] }).tools?.[0]?.function?.name)).toBe(
      'retrieve_passages',
    )

    const qOut = await getExecutor('AppInput')(question, {}, noProg, { signal })
    const out = await getExecutor('AppAgent')(
      agent,
      { 0: qOut[0], 1: tools[0] },
      noProg,
      { signal },
    )

    expect(postCompleteToolsMock).toHaveBeenCalledTimes(1)
    expect(String((out[0] as { text?: string }).text ?? '')).toMatch(/BM25/)
    expect(String((out[1] as { text?: string }).text ?? '')).toMatch(/Final answer/)
  })

  it('runs one echo tool call then finishes', async () => {
    postCompleteToolsMock
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            id: 'c1',
            name: 'echo_demo',
            arguments: '{"message":"ping"}',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Done.',
        tool_calls: [],
      })

    const toolRet = nodeById(AGENT_DEMO_GRAPH, 'agent-tool-retrieve')
    const toolEcho = nodeById(AGENT_DEMO_GRAPH, 'agent-tool-echo')
    const join = nodeById(AGENT_DEMO_GRAPH, 'agent-tools-join')
    const agent = nodeById(AGENT_DEMO_GRAPH, 'agent-node')
    const question = nodeById(AGENT_DEMO_GRAPH, 'agent-input')

    const a = await getExecutor('AppTool')(toolRet, {}, noProg, { signal })
    const b = await getExecutor('AppTool')(toolEcho, {}, noProg, { signal })
    const tools = await getExecutor('AppToolsJoin')(
      join,
      { 0: a[0], 1: b[0] },
      noProg,
      { signal },
    )
    const qOut = await getExecutor('AppInput')(question, {}, noProg, { signal })
    const out = await getExecutor('AppAgent')(
      agent,
      { 0: qOut[0], 1: tools[0] },
      noProg,
      { signal },
    )

    expect(postCompleteToolsMock).toHaveBeenCalledTimes(2)
    const trace = String((out[1] as { text?: string }).text ?? '')
    expect(trace).toMatch(/echo_demo/)
  })
})
