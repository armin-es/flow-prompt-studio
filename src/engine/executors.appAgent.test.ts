import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { GraphNode } from '../types'
import type { NodeOutput } from '../store/executionStore'
import type { ToolsPayload } from '../lib/toolsPayload'
import { TOOLS_DATA_TYPE } from '../lib/toolsPayload'
import { getExecutor } from './executors'
import { postCompleteTools } from '../lib/completeToolsClient'

vi.mock('../lib/completeToolsClient', () => ({
  postCompleteTools: vi.fn(),
}))

const postCompleteToolsMock = vi.mocked(postCompleteTools)

const signal = new AbortController().signal
const noProg = () => {}

function agentNode(widgetValues: unknown[]): GraphNode {
  return {
    id: 'agent',
    type: 'AppAgent',
    label: 'Agent',
    position: { x: 0, y: 0 },
    width: 300,
    height: 300,
    inputs: [],
    outputs: [],
    widgetValues,
  }
}

function textOut(s: string): NodeOutput {
  return { type: 'TEXT', text: s }
}

function echoRegistry(): ToolsPayload {
  return {
    type: TOOLS_DATA_TYPE,
    tools: [
      {
        type: 'function',
        function: {
          name: 'echo_demo',
          description: 'Echo',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    implByName: { echo_demo: { impl: 'echo' } },
  }
}

beforeEach(() => {
  postCompleteToolsMock.mockReset()
})

describe('AppAgent executor', () => {
  it('no tool calls ⇒ single step ⇒ answer + trace', async () => {
    postCompleteToolsMock.mockResolvedValueOnce({
      content: 'Hello world',
      tool_calls: [],
    })
    const ex = getExecutor('AppAgent')
    const out = await ex(
      agentNode([6, 'gpt-4o-mini', '']),
      { 0: textOut('Hi'), 1: echoRegistry() },
      noProg,
      { signal },
    )
    expect(postCompleteToolsMock).toHaveBeenCalledTimes(1)
    expect((out[0] as { text?: string }).text).toBe('Hello world')
    expect(String((out[1] as { text?: string }).text)).toContain('Final answer')
  })

  it('one echo tool call ⇒ two API steps ⇒ trace lists tool', async () => {
    postCompleteToolsMock
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            name: 'echo_demo',
            arguments: '{"message":"x"}',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Done.',
        tool_calls: [],
      })
    const ex = getExecutor('AppAgent')
    const out = await ex(
      agentNode([6, 'gpt-4o-mini', '']),
      { 0: textOut('Use echo'), 1: echoRegistry() },
      noProg,
      { signal },
    )
    expect(postCompleteToolsMock).toHaveBeenCalledTimes(2)
    const trace = String((out[1] as { text?: string }).text ?? '')
    expect(trace).toContain('echo_demo')
    expect(trace).toContain('ok')
  })

  it('budget exhausted prefix when steps run out', async () => {
    postCompleteToolsMock.mockResolvedValue({
      content: null,
      tool_calls: [
        {
          id: 'call_x',
          name: 'echo_demo',
          arguments: '{}',
        },
      ],
    })
    const ex = getExecutor('AppAgent')
    const out = await ex(
      agentNode([1, 'gpt-4o-mini', '']),
      { 0: textOut('loop'), 1: echoRegistry() },
      noProg,
      { signal },
    )
    expect(String((out[0] as { text?: string }).text ?? '')).toMatch(/^\[budget exhausted\]/)
    expect(postCompleteToolsMock).toHaveBeenCalledTimes(1)
  })

  it('aborts when signal aborts before completion', async () => {
    postCompleteToolsMock.mockImplementation(
      async (_body, opts) =>
        new Promise((_, rej) => {
          const onAbort = () => {
            opts?.signal?.removeEventListener('abort', onAbort)
            rej(new DOMException('aborted', 'AbortError'))
          }
          opts?.signal?.addEventListener('abort', onAbort, { once: true })
        }),
    )
    const ac = new AbortController()
    const ex = getExecutor('AppAgent')
    const p = ex(
      agentNode([6, 'gpt-4o-mini', '']),
      { 0: textOut('x'), 1: echoRegistry() },
      noProg,
      { signal: ac.signal },
    )
    queueMicrotask(() => ac.abort())
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
