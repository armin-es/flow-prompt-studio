import { createHash } from 'node:crypto'

const ALLOWED = new Set(['.md', '.txt', '.json'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function isAllowedIngestName(name: string): boolean {
  return ALLOWED.has(extOf(name))
}

export function formatIngestedBlock(filename: string, body: string): string {
  return `# ${filename}\n\n${body}`.trimEnd()
}

/**
 * Append new blocks with `---` delimiters. Returns error if over maxBytes.
 */
export function appendBlocksToBody(
  currentBody: string,
  blocks: { title: string; body: string }[],
  maxBytes: number = 65_536,
): { body: string; error?: string } {
  if (blocks.length === 0) {
    return { body: currentBody }
  }
  const pieces = blocks.map((b) => formatIngestedBlock(b.title, b.body))
  const a = currentBody.trim()
  const b = pieces.join('\n\n---\n\n')
  const finalBody = a.length === 0 ? b : `${a}\n\n---\n\n${b}`

  if (finalBody.length > maxBytes) {
    return {
      body: currentBody,
      error: `Would exceed the ${maxBytes.toLocaleString()} character limit.`,
    }
  }
  return { body: finalBody }
}

export function sha256Hex(utf8: string): string {
  return createHash('sha256').update(utf8, 'utf8').digest('hex')
}
