const DEFAULT_DOC_DELIM = '\n\n---\n\n'

export type TextChunk = {
  text: string
  /** Human-readable provenance, e.g. \`BM25 · part 2\` */
  source: string
  /** Title for citations, usually first line of doc with \`# \` stripped */
  docTitle: string
  /** 1-based chunk index within the document (passage / window index) */
  partIndex: number
  /** Stable id for the source document in this corpus, e.g. \`doc-1\` */
  docId: string
  /** 1-based index of the first paragraph in this chunk (document paragraph list) */
  firstParagraphIndex: number
  /** 1-based index of the last paragraph in this chunk (inclusive) */
  lastParagraphIndex: number
}

export type ChunkCorpusOptions = {
  docDelimiter?: string
  chunkSize: number
  chunkOverlap: number
}

/** Bracket label used in Retrieve output and LLM citations, e.g. `[BM25 (¶1)]`. */
export function formatCitationLabel(
  c: Pick<TextChunk, 'docTitle' | 'partIndex'>,
): string {
  return `[${c.docTitle} (¶${c.partIndex})]`
}

function splitDocumentIntoParagraphs(doc: string): string[] {
  return doc
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function takeDocTitle(firstParagraph: string | undefined, docIndex: number): string {
  if (firstParagraph == null) {
    return `Document ${docIndex + 1}`
  }
  const t = firstParagraph.replace(/^#+\s*/, '').trim().slice(0, 80)
  return t.length > 0 ? t : `Document ${docIndex + 1}`
}

/** Split a single paragraph that exceeds `maxLen` with character windows and `overlap`. */
function splitOversizedParagraph(
  text: string,
  maxLen: number,
  overlap: number,
): string[] {
  if (text.length === 0) {
    return []
  }
  if (maxLen < 1) {
    return []
  }
  const o = Math.max(0, Math.min(overlap, maxLen - 1))
  const step = Math.max(1, maxLen - o)
  const out: string[] = []
  for (let off = 0; off < text.length; off += step) {
    const w = text.slice(off, off + maxLen)
    if (w.length > 0) {
      out.push(w)
    }
    if (off + maxLen >= text.length) {
      break
    }
  }
  return out
}

/**
 * After emitting a chunk that covers `parts[i0 .. jExclusive)`, pick the
 * **1-based** index of the first paragraph in the *next* chunk, overlapping
 * by ~`overlap` characters and snapping to a paragraph start.
 */
function nextStartParagraph1Based(
  parts: string[],
  i0: number,
  jExclusive: number,
  overlap: number,
): number {
  const n = jExclusive - i0
  if (n < 1) {
    return jExclusive + 1
  }
  const chunkText = joinParagraphs(parts.slice(i0, jExclusive))
  if (chunkText.length === 0) {
    return jExclusive + 1
  }
  if (chunkText.length <= overlap) {
    return Math.min(jExclusive + 1, parts.length + 1)
  }
  const back = chunkText.length - overlap
  const relStarts: number[] = []
  let pos = 0
  for (let k = 0; k < n; k++) {
    relStarts.push(pos)
    pos += parts[i0 + k]!.length
    if (k < n - 1) {
      pos += 2
    }
  }
  let r = 0
  for (; r < n; r++) {
    if (relStarts[r]! >= back) {
      break
    }
  }
  if (r >= n) {
    r = n - 1
  }
  let next0 = i0 + r
  const min0 = i0 + 1
  if (next0 < min0) {
    next0 = min0
  }
  if (next0 >= parts.length) {
    return parts.length + 1
  }
  return next0 + 1
}

function joinParagraphs(paras: string[]): string {
  if (paras.length === 0) {
    return ''
  }
  return paras.join('\n\n')
}

function chunkOneDocument(
  doc: string,
  docIndex: number,
  chunkSize: number,
  overlap: number,
): TextChunk[] {
  const out: TextChunk[] = []
  if (doc.trim().length === 0) {
    return out
  }
  const parts = splitDocumentIntoParagraphs(doc)
  if (parts.length === 0) {
    return out
  }
  const docId = `doc-${docIndex + 1}`
  const docTitle = takeDocTitle(parts[0], docIndex)
  let partIndex = 0
  let i = 0

  while (i < parts.length) {
    if (parts[i]!.length > chunkSize) {
      const subs = splitOversizedParagraph(parts[i]!, chunkSize, overlap)
      for (const sub of subs) {
        partIndex += 1
        const p1 = i + 1
        out.push({
          text: sub,
          source:
            subs.length > 1
              ? `${docTitle} · part ${partIndex}`
              : docTitle,
          docTitle,
          partIndex,
          docId,
          firstParagraphIndex: p1,
          lastParagraphIndex: p1,
        })
      }
      i += 1
      continue
    }
    let j = i
    let acc = parts[i]!
    while (j + 1 < parts.length) {
      const next = acc + '\n\n' + parts[j + 1]!
      if (next.length <= chunkSize) {
        acc = next
        j += 1
      } else {
        break
      }
    }
    partIndex += 1
    const pStart = i + 1
    const pEnd = j + 1
    out.push({
      text: acc,
      source: partIndex === 1 ? docTitle : `${docTitle} · part ${partIndex}`,
      docTitle,
      partIndex,
      docId,
      firstParagraphIndex: pStart,
      lastParagraphIndex: pEnd,
    })
    if (j + 1 >= parts.length) {
      break
    }
    const nextI1 = nextStartParagraph1Based(parts, i, j + 1, overlap)
    i = nextI1 - 1
  }
  return out
}

/**
 * Splits a corpus on the document delimiter, then **packs full paragraphs** into
 * character-budgeted chunks. Single paragraphs longer than `chunkSize` are split
 * on characters (only place mid-“paragraph” cut happens). Consecutive chunk windows
 * overlap by ~`chunkOverlap` characters, snapped to paragraph starts when possible.
 */
export function chunkCorpus(
  corpus: string,
  { docDelimiter = DEFAULT_DOC_DELIM, chunkSize, chunkOverlap }: ChunkCorpusOptions,
): TextChunk[] {
  if (chunkSize < 1) {
    return []
  }
  const overlap = Math.max(0, Math.min(chunkOverlap, chunkSize - 1))
  const rawDocs = corpus.split(docDelimiter).map((d) => d.trim()).filter(Boolean)
  const out: TextChunk[] = []
  for (let d = 0; d < rawDocs.length; d++) {
    out.push(
      ...chunkOneDocument(rawDocs[d]!, d, chunkSize, overlap),
    )
  }
  return out
}
