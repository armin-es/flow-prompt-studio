import type { GraphNode } from '../types'
import { CORPUS_DEFAULT_ID } from '../store/corpusStore'

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `id-${Date.now()}`

/**
 * App pipeline node kinds the user can spawn from the **Add** palette
 * (TEXT-only utilities + Input / LLM / Output).
 */
export type CreatableAppNodeType =
  | 'AppInput'
  | 'AppLlm'
  | 'AppOutput'
  | 'AppJoin'
  | 'AppToolsJoin'
  | 'AppTee'
  | 'AppPrefix'
  | 'AppPick'
  | 'AppRetrieve'
  | 'AppAgent'
  | 'AppTool'

const TEXT = 'TEXT' as const
const TOOLS = 'TOOLS' as const

/**
 * New node with default labels, size, and ports (matches executors + existing demos).
 */
export function createAppNode(
  type: CreatableAppNodeType,
  position: { x: number; y: number },
): GraphNode {
  const id = `new-${type}-${uid()}`
  const base: Pick<
    GraphNode,
    'id' | 'position' | 'label' | 'width' | 'height'
  > = {
    id,
    position: { ...position },
    label: defaultLabel(type),
    width: defaultWidth(type),
    height: defaultHeight(type),
  }
  switch (type) {
    case 'AppInput':
      return {
        ...base,
        type: 'AppInput',
        inputs: [],
        outputs: [{ name: 'out', dataType: TEXT }],
        widgetValues: [''],
      }
    case 'AppLlm':
      return {
        ...base,
        type: 'AppLlm',
        inputs: [{ name: 'prompt', dataType: TEXT }],
        outputs: [{ name: 'out', dataType: TEXT }],
        widgetValues: [
          'You are a clear, concise assistant. No markdown unless asked.',
        ],
      }
    case 'AppOutput':
      return {
        ...base,
        type: 'AppOutput',
        inputs: [{ name: 'in', dataType: TEXT }],
        outputs: [],
        widgetValues: [],
      }
    case 'AppJoin':
      return {
        ...base,
        type: 'AppJoin',
        inputs: [
          { name: 'a', dataType: TEXT },
          { name: 'b', dataType: TEXT },
        ],
        outputs: [{ name: 'out', dataType: TEXT }],
        widgetValues: ['\n'],
      }
    case 'AppTee':
      return {
        ...base,
        type: 'AppTee',
        inputs: [{ name: 'in', dataType: TEXT }],
        outputs: [
          { name: 'out A', dataType: TEXT },
          { name: 'out B', dataType: TEXT },
        ],
        widgetValues: [],
      }
    case 'AppPrefix':
      return {
        ...base,
        type: 'AppPrefix',
        inputs: [{ name: 'in', dataType: TEXT }],
        outputs: [{ name: 'out', dataType: TEXT }],
        widgetValues: [''],
      }
    case 'AppPick':
      return {
        ...base,
        type: 'AppPick',
        inputs: [
          { name: '0', dataType: TEXT },
          { name: '1', dataType: TEXT },
        ],
        outputs: [{ name: 'out', dataType: TEXT }],
        widgetValues: ['0'],
      }
    case 'AppRetrieve':
      return {
        ...base,
        type: 'AppRetrieve',
        inputs: [{ name: 'query', dataType: TEXT }],
        outputs: [{ name: 'snippets', dataType: TEXT }],
        widgetValues: [3, CORPUS_DEFAULT_ID, 800, 100, 'bm25'],
      }
    case 'AppToolsJoin':
      return {
        ...base,
        type: 'AppToolsJoin',
        inputs: [
          { name: 'a', dataType: TOOLS },
          { name: 'b', dataType: TOOLS },
        ],
        outputs: [{ name: 'out', dataType: TOOLS }],
        widgetValues: [],
      }
    case 'AppAgent':
      return {
        ...base,
        type: 'AppAgent',
        inputs: [
          { name: 'prompt', dataType: TEXT },
          { name: 'tools', dataType: TOOLS },
        ],
        outputs: [
          { name: 'answer', dataType: TEXT },
          { name: 'trace', dataType: TEXT },
        ],
        widgetValues: [
          6,
          'gpt-4o-mini',
          'You are a careful assistant; cite tools briefly.',
        ],
      }
    case 'AppTool':
      return {
        ...base,
        type: 'AppTool',
        inputs: [],
        outputs: [{ name: 'tools', dataType: TOOLS }],
        widgetValues: [
          'echo_demo',
          'Echo input back as JSON.',
          '{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}',
          'echo',
          CORPUS_DEFAULT_ID,
        ],
      }
  }
}

function defaultLabel(t: CreatableAppNodeType): string {
  switch (t) {
    case 'AppInput':
      return 'Input'
    case 'AppLlm':
      return 'LLM'
    case 'AppOutput':
      return 'Output'
    case 'AppJoin':
      return 'Join'
    case 'AppTee':
      return 'Tee'
    case 'AppPrefix':
      return 'Prefix'
    case 'AppPick':
      return 'Pick'
    case 'AppRetrieve':
      return 'Retrieve'
    case 'AppToolsJoin':
      return 'Join (tools)'
    case 'AppAgent':
      return 'Agent'
    case 'AppTool':
      return 'Tool'
    default: {
      const _e: never = t
      return _e
    }
  }
}

function defaultWidth(t: CreatableAppNodeType): number {
  switch (t) {
    case 'AppLlm':
      return 300
    case 'AppInput':
    case 'AppOutput':
    case 'AppJoin':
      return 280
    case 'AppTee':
    case 'AppPick':
      return 220
    case 'AppPrefix':
      return 250
    case 'AppRetrieve':
      return 320
    case 'AppAgent':
      return 340
    case 'AppTool':
      return 300
    case 'AppToolsJoin':
      return 260
    default: {
      const _e: never = t
      return _e
    }
  }
}

function defaultHeight(t: CreatableAppNodeType): number {
  switch (t) {
    case 'AppLlm':
      return 200
    case 'AppInput':
      return 160
    case 'AppOutput':
      return 120
    case 'AppJoin':
      return 150
    case 'AppTee':
    case 'AppPick':
      return 120
    case 'AppPrefix':
      return 130
    case 'AppRetrieve':
      return 400
    case 'AppAgent':
      return 420
    case 'AppTool':
      return 340
    case 'AppToolsJoin':
      return 140
    default: {
      const _e: never = t
      return _e
    }
  }
}
