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
  | 'AppTee'
  | 'AppPrefix'
  | 'AppPick'
  | 'AppRetrieve'

const TEXT = 'TEXT' as const

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
    default: {
      const _e: never = t
      return _e
    }
  }
}
