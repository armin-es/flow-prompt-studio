import { sha256Hex } from './embedCache'

const MAX_CORPUS_BYTES = 65_536
const ALLOWED = new Set(['.md', '.txt', '.json'])

export type IngestedDocument = {
  /** Stable id: basename + short hash (for UI/debug, not stored in text) */
  id: string
  title: string
  body: string
  addedAt: number
  sha256: string
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function isAllowedCorpusIngestFile(file: File): boolean {
  return ALLOWED.has(extOf(file.name))
}

export function filterIngestFiles(files: FileList | File[]): File[] {
  const out: File[] = []
  const list = Array.isArray(files) ? files : Array.from(files)
  for (const f of list) {
    if (isAllowedCorpusIngestFile(f)) {
      out.push(f)
    }
  }
  return out
}

/**
 * Read UTF-8 text and build a document record (SHA-256 of raw bytes as hex).
 */
export async function fileToIngestedDocument(file: File): Promise<IngestedDocument> {
  const text = await file.text()
  const sha = await sha256Hex(text)
  const base = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64) || 'file'
  return {
    id: `${base}-${sha.slice(0, 8)}`,
    title: file.name,
    body: text,
    addedAt: Date.now(),
    sha256: sha,
  }
}

/**
 * One corpus “document” block: heading from filename, then body (chunker uses first line as doc title in citations).
 */
export function formatIngestedBlock(d: IngestedDocument): string {
  return `# ${d.title}\n\n${d.body}`.trimEnd()
}

/**
 * Append ingested documents to the corpus, using the same `---` convention as the rest of the app.
 * Returns an error if the result would exceed `maxBytes` (default 64 KB).
 */
export function appendIngestedToCorpus(
  currentBody: string,
  docs: IngestedDocument[],
  maxBytes: number = MAX_CORPUS_BYTES,
): { body: string; error?: string } {
  if (docs.length === 0) {
    return { body: currentBody }
  }
  const blocks = docs.map(formatIngestedBlock)
  const a = currentBody.trim()
  const b = blocks.join('\n\n---\n\n')
  const finalBody = a.length === 0 ? b : `${a}\n\n---\n\n${b}`

  if (finalBody.length > maxBytes) {
    return {
      body: currentBody,
      error: `Adding these files would exceed the ${maxBytes.toLocaleString()} character limit. Remove text or add fewer files.`,
    }
  }
  return { body: finalBody }
}
