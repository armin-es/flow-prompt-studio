import type { NodeOutput } from '../store/executionStore'
import type { GraphNode } from '../types'

/**
 * Produces a short, readable line for the Run result panel from a node’s final outputs.
 */
export function formatRunSummary(
  node: GraphNode,
  outputs: Record<number, NodeOutput>,
): { summary: string; sourceNodeId: string; sourceNodeType: string } {
  const o0 = outputs[0] as (NodeOutput & { type?: string }) | undefined
  if (!o0) {
    return {
      summary: 'No output on port 0.',
      sourceNodeId: node.id,
      sourceNodeType: node.type,
    }
  }

  if (o0.type === 'TEXT' && o0.text != null) {
    const t = String(o0.text)
    const short = t.length > 2_000 ? `${t.slice(0, 2_000)}…` : t
    return {
      summary: short,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
    }
  }

  if (node.type === 'SaveImage' && o0.type === 'SAVED') {
    const path = o0.path as string | undefined
    const w = o0.width
    const h = o0.height
    const summary = path
      ? `Saved: ${path}${w != null && h != null ? ` (${w} x ${h})` : ''}`
      : String(JSON.stringify(o0))
    return { summary, sourceNodeId: node.id, sourceNodeType: node.type }
  }

  if (o0.type === 'IMAGE') {
    return {
      summary: `Image ${o0.width ?? '?'} x ${o0.height ?? '?'}`,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
    }
  }

  if (o0.type === 'LATENT' && Array.isArray(o0.shape)) {
    return {
      summary: `Latent shape: [${(o0.shape as number[]).join(', ')}]`,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
    }
  }

  if (o0.type === 'CONDITIONING' && o0.text != null) {
    const t = String(o0.text)
    const short = t.length > 200 ? `${t.slice(0, 200)}…` : t
    return { summary: `Conditioning: ${short}`, sourceNodeId: node.id, sourceNodeType: node.type }
  }

  try {
    const s = JSON.stringify(o0, null, 0)
    const short = s.length > 400 ? `${s.slice(0, 400)}…` : s
    return { summary: short, sourceNodeId: node.id, sourceNodeType: node.type }
  } catch {
    return { summary: String(o0), sourceNodeId: node.id, sourceNodeType: node.type }
  }
}
