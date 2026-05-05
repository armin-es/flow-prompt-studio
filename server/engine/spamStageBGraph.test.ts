import { describe, expect, it } from 'vitest'
import type { SerializedGraphJson } from '../db/schema.js'
import type { ServerNodeOutput } from './serverExecutors.js'
import {
  extractSpamStageBv2Outputs,
  graphUsesSpamStageBV2,
} from './spamStageBGraph.js'

describe('spamStageBGraph', () => {
  const v2Graph: SerializedGraphJson = {
    version: 1,
    nodes: [
      [
        'j',
        {
          id: 'j',
          type: 'SpamJudge',
          label: 'j',
          position: { x: 0, y: 0 },
          width: 1,
          height: 1,
          inputs: [],
          outputs: [{ name: 'o', dataType: 'TEXT' }],
          widgetValues: [],
        },
      ],
      [
        'c',
        {
          id: 'c',
          type: 'SpamCombine',
          label: 'c',
          position: { x: 0, y: 0 },
          width: 1,
          height: 1,
          inputs: [],
          outputs: [{ name: 'o', dataType: 'TEXT' }],
          widgetValues: [],
        },
      ],
    ],
    edges: [],
    selection: [],
    edgeSelection: [],
  }

  it('detects v2 when SpamJudge and SpamCombine present', () => {
    expect(graphUsesSpamStageBV2(v2Graph)).toBe(true)
    expect(
      graphUsesSpamStageBV2({
        ...v2Graph,
        nodes: [v2Graph.nodes[0]!],
      }),
    ).toBe(false)
  })

  it('extracts judge + combine outputs', () => {
    const order = ['j', 'c']
    const outputs = new Map<string, ServerNodeOutput>([
      [
        'j:0',
        {
          type: 'TEXT',
          text: JSON.stringify({
            verdict: 'ham',
            confidence: 0.9,
            rationale: 'ok',
            citedExample: '',
            citedPolicy: '',
          }),
        },
      ],
      [
        'c:0',
        {
          type: 'TEXT',
          text: JSON.stringify({
            finalAction: 'allow',
            llmScore: 0.9,
            ruleScore: 1,
          }),
        },
      ],
    ])
    const got = extractSpamStageBv2Outputs(v2Graph, order, outputs)
    expect(got?.judge.verdict).toBe('ham')
    expect(got?.combine.finalAction).toBe('allow')
  })
})
