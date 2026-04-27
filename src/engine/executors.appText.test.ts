import { describe, expect, it, beforeAll } from 'vitest'
import { getExecutor } from './executors'
import type { GraphNode } from '../types'
import type { NodeOutput } from '../store/executionStore'
import { useCorpusStore, __clearCorpusStoreForTests } from '../store/corpusStore'

const signal = new AbortController().signal
const noProg = () => {}

function n(type: string, widgetValues: unknown[]): GraphNode {
  return {
    id: 'n',
    type,
    label: 'n',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    inputs: [],
    outputs: [],
    widgetValues,
  }
}

const t = (s: string): NodeOutput => ({ type: 'TEXT', text: s })

beforeAll(async () => {
  __clearCorpusStoreForTests()
  await useCorpusStore.getState().init()
})

describe('AppTee / AppJoin / AppPrefix / AppPick', () => {
  it('AppTee duplicates TEXT', async () => {
    const ex = getExecutor('AppTee')
    const out = await ex(n('AppTee', []), { 0: t('x') }, noProg, { signal })
    expect(out[0]).toEqual(t('x'))
    expect(out[1]).toEqual(t('x'))
  })

  it('AppJoin joins with separator', async () => {
    const ex = getExecutor('AppJoin')
    const out = await ex(
      n('AppJoin', ['|']),
      { 0: t('a'), 1: t('b') },
      noProg,
      { signal },
    )
    expect((out[0] as { text?: string }).text).toBe('a|b')
  })

  it('AppPrefix prepends', async () => {
    const ex = getExecutor('AppPrefix')
    const out = await ex(
      n('AppPrefix', ['>> ']),
      { 0: t('hi') },
      noProg,
      { signal },
    )
    expect((out[0] as { text?: string }).text).toBe('>> hi')
  })

  it('AppPick chooses port', async () => {
    const ex = getExecutor('AppPick')
    const out0 = await ex(
      n('AppPick', ['0']),
      { 0: t('A'), 1: t('B') },
      noProg,
      { signal },
    )
    expect((out0[0] as { text?: string }).text).toBe('A')
    const out1 = await ex(
      n('AppPick', ['1']),
      { 0: t('A'), 1: t('B') },
      noProg,
      { signal },
    )
    expect((out1[0] as { text?: string }).text).toBe('B')
  })

  it('AppRetrieve returns BM25 passages and hits metadata', async () => {
    const ex = getExecutor('AppRetrieve')
    const corpus = [
      'Only here: xyzzyplugh unique token alpha',
      'beta gamma delta no match',
      'other xyzzyplugh mention',
    ].join('\n\n---\n\n')
    const cid = 'corpus-test-xyzzy'
    useCorpusStore.getState().upsert(cid, 'Test', corpus)
    const out = await ex(
      n('AppRetrieve', [2, cid, 200, 20, 'bm25']),
      { 0: t('xyzzyplugh unique') },
      noProg,
      { signal },
    )
    const o0 = out[0] as { text?: string; retrieveHits?: { source: string; score: number }[] }
    expect(o0.text).toContain('Passage [1]')
    expect(o0.text).toContain("I don't know")
    expect(o0.text).toContain('xyzzyplugh')
    expect(o0.retrieveHits?.length).toBeGreaterThan(0)
  })
})
