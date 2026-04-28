import type { NodeOutput } from '../store/executionStore'

export const TOOLS_DATA_TYPE = 'TOOLS' as const

/** OpenAI-compatible tool definition (subset used by chat completions). */
export type ToolDefinitionJson = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

/** Per-tool runtime binding for built-ins (client-side execution). */
export type ToolImplBinding = {
  impl: 'retrieve' | 'http_get' | 'calc' | 'echo'
  corpusId?: string
}

export interface ToolsPayload extends NodeOutput {
  type: typeof TOOLS_DATA_TYPE
  tools: ToolDefinitionJson[]
  implByName: Record<string, ToolImplBinding>
}

export function emptyToolsPayload(): ToolsPayload {
  return { type: TOOLS_DATA_TYPE, tools: [], implByName: {} }
}

export function isToolsPayload(v: NodeOutput | undefined): v is ToolsPayload {
  return v?.type === TOOLS_DATA_TYPE && Array.isArray((v as ToolsPayload).tools)
}

export function toolsFrom(v: NodeOutput | undefined): ToolsPayload {
  if (isToolsPayload(v)) {
    return {
      type: TOOLS_DATA_TYPE,
      tools: [...v.tools],
      implByName: { ...v.implByName },
    }
  }
  return emptyToolsPayload()
}

export function mergeToolsPayload(a: ToolsPayload, b: ToolsPayload): ToolsPayload {
  const implByName = { ...a.implByName, ...b.implByName }
  return {
    type: TOOLS_DATA_TYPE,
    tools: [...a.tools, ...b.tools],
    implByName,
  }
}
