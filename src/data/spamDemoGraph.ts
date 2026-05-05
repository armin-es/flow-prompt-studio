import type { AppGraphState } from './defaultAppGraph'

/**
 * Spam triage pipeline (Stage A rules + retrieval + SpamJudge + SpamCombine).
 * Local demo uses `AppSpamPasteSource` so you can run without a queue row; the server seed
 * `SPAM_DEFAULT_GRAPH_DATA` in `server/spam/spamStageB.ts` keeps `AppSpamItemSource` for Stage B.
 *
 * Layout:
 *   [SpamPasteSource] ─┬─► [SpamRules] ────────────────┐
 *                     ├─► [SpamRetrieveExamples] ──┐  │
 *                     ├─► [SpamRetrievePolicy] ──┐ │  │
 *                     └─► body/feats ───────────► [SpamJudge] ─► [SpamCombine] ─► [Output]
 */

export const SPAM_DEMO_GRAPH: AppGraphState = {
  nodes: [
    {
      id: 'spam-src',
      type: 'AppSpamPasteSource',
      label: 'Spam paste',
      position: { x: 40, y: 200 },
      width: 300,
      height: 260,
      inputs: [],
      outputs: [
        { name: 'body', dataType: 'TEXT' },
        { name: 'features JSON', dataType: 'TEXT' },
      ],
      widgetValues: ['Limited offer — click my link to double your engagement!', 3, 0],
    },
    {
      id: 'spam-rules',
      type: 'AppSpamRules',
      label: 'Spam rules (Stage A)',
      position: { x: 400, y: 380 },
      width: 300,
      height: 200,
      inputs: [
        { name: 'body', dataType: 'TEXT' },
        { name: 'features JSON', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'scores', dataType: 'TEXT' }],
      widgetValues: [],
    },
    {
      id: 'spam-ex',
      type: 'SpamRetrieveExamples',
      label: 'Retrieve examples',
      position: { x: 400, y: 80 },
      width: 300,
      height: 170,
      inputs: [
        { name: 'body', dataType: 'TEXT' },
        { name: 'categoryId', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'passages', dataType: 'TEXT' }],
      widgetValues: ['', 5],
    },
    {
      id: 'spam-pol',
      type: 'SpamRetrievePolicy',
      label: 'Retrieve policy',
      position: { x: 400, y: 240 },
      width: 300,
      height: 170,
      inputs: [
        { name: 'body', dataType: 'TEXT' },
        { name: 'categoryId', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'passages', dataType: 'TEXT' }],
      widgetValues: ['', 3],
    },
    {
      id: 'spam-judge',
      type: 'SpamJudge',
      label: 'Spam judge',
      position: { x: 780, y: 140 },
      width: 340,
      height: 260,
      inputs: [
        { name: 'body', dataType: 'TEXT' },
        { name: 'features JSON', dataType: 'TEXT' },
        { name: 'examples', dataType: 'TEXT' },
        { name: 'policy', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'verdict JSON', dataType: 'TEXT' }],
      widgetValues: ['gpt-4o-mini', 0, 0],
    },
    {
      id: 'spam-combine',
      type: 'SpamCombine',
      label: 'Combine rules + judge',
      position: { x: 1180, y: 220 },
      width: 320,
      height: 160,
      inputs: [
        { name: 'rules JSON', dataType: 'TEXT' },
        { name: 'judge JSON', dataType: 'TEXT' },
      ],
      outputs: [{ name: 'combined JSON', dataType: 'TEXT' }],
      widgetValues: [],
    },
    {
      id: 'spam-out',
      type: 'AppOutput',
      label: 'Verdict JSON',
      position: { x: 1560, y: 240 },
      width: 300,
      height: 120,
      inputs: [{ name: 'in', dataType: 'TEXT' }],
      outputs: [],
      widgetValues: [],
    },
  ],
  edges: [
    {
      id: 'spam-ev2-a',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 0,
      targetNodeId: 'spam-rules',
      targetPortIndex: 0,
    },
    {
      id: 'spam-ev2-b',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 1,
      targetNodeId: 'spam-rules',
      targetPortIndex: 1,
    },
    {
      id: 'spam-ev2-c',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 0,
      targetNodeId: 'spam-ex',
      targetPortIndex: 0,
    },
    {
      id: 'spam-ev2-d',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 0,
      targetNodeId: 'spam-pol',
      targetPortIndex: 0,
    },
    {
      id: 'spam-ev2-e',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 0,
      targetNodeId: 'spam-judge',
      targetPortIndex: 0,
    },
    {
      id: 'spam-ev2-f',
      sourceNodeId: 'spam-src',
      sourcePortIndex: 1,
      targetNodeId: 'spam-judge',
      targetPortIndex: 1,
    },
    {
      id: 'spam-ev2-g',
      sourceNodeId: 'spam-ex',
      sourcePortIndex: 0,
      targetNodeId: 'spam-judge',
      targetPortIndex: 2,
    },
    {
      id: 'spam-ev2-h',
      sourceNodeId: 'spam-pol',
      sourcePortIndex: 0,
      targetNodeId: 'spam-judge',
      targetPortIndex: 3,
    },
    {
      id: 'spam-ev2-i',
      sourceNodeId: 'spam-rules',
      sourcePortIndex: 0,
      targetNodeId: 'spam-combine',
      targetPortIndex: 0,
    },
    {
      id: 'spam-ev2-j',
      sourceNodeId: 'spam-judge',
      sourcePortIndex: 0,
      targetNodeId: 'spam-combine',
      targetPortIndex: 1,
    },
    {
      id: 'spam-ev2-k',
      sourceNodeId: 'spam-combine',
      sourcePortIndex: 0,
      targetNodeId: 'spam-out',
      targetPortIndex: 0,
    },
  ],
}
