import type { GraphNode } from '../types'
import type { NodeOutput } from '../store/executionStore'
import { postComplete } from '../lib/completeClient'
import { postCompleteStream } from '../lib/completeStream'
import { chunkCorpus, formatCitationLabel } from './retrieve/chunk'
import { useCorpusStore } from '../store/corpusStore'
import {
  cosineClientFallbackEnabled,
  preferServerCosineRetrieval,
  retrieveFromServer,
  serverSyncEnabled,
  syncCorpusToServer,
} from '../lib/serverApi'
import { rankChunksForQuery } from './retrieve/rankRetrieve'

type Inputs = Record<number, NodeOutput | undefined>
type Outputs = Record<number, NodeOutput>
type OnProgress = (p: number) => void
export type ExecutorContext = {
  signal: AbortSignal
  /** When set (e.g. AppLlm), LLM completion streams and this receives the full text so far. */
  onStreamText?: (fullText: string) => void
}

type ExecutorFn = (
  node: GraphNode,
  inputs: Inputs,
  onProgress: OnProgress,
  ctx: ExecutorContext,
) => Promise<Outputs>

function textFrom(v: NodeOutput | undefined): string {
  if (!v || v.type !== 'TEXT') {
    return ''
  }
  return String((v as { text?: string }).text ?? '')
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms)
    const a = () => {
      clearTimeout(t)
      rej(new DOMException('aborted', 'AbortError'))
    }
    if (signal.aborted) a()
    else signal.addEventListener('abort', a, { once: true })
  })
}

const executors: Record<string, ExecutorFn> = {
  Stress: async (_node, inputs, onProgress, ctx) => {
    void onProgress
    void ctx
    const wire = inputs[0] as (NodeOutput & { type?: string; text?: string }) | undefined
    const text =
      wire?.type === 'TEXT' ? String(wire.text ?? '') : '·'
    return {
      0: { type: 'TEXT', text },
    }
  },

  CheckpointLoaderSimple: async (node, _inputs, _onProgress, ctx) => {
    await delay(700, ctx.signal)
    const checkpoint = (node.widgetValues[0] as string) ?? 'model.ckpt'
    return {
      0: { type: 'MODEL', checkpoint },
      1: { type: 'CLIP', checkpoint },
      2: { type: 'VAE', checkpoint },
    }
  },

  CLIPTextEncode: async (node, inputs, _onProgress, ctx) => {
    await delay(250, ctx.signal)
    const text = (node.widgetValues[0] as string) ?? ''
    return {
      0: {
        type: 'CONDITIONING',
        text,
        from: (inputs[0] as NodeOutput | undefined)?.checkpoint ?? 'CLIP',
      },
    }
  },

  EmptyLatentImage: async (node, _inputs, _onProgress, ctx) => {
    await delay(80, ctx.signal)
    const w = (node.widgetValues[0] as number) ?? 512
    const h = (node.widgetValues[1] as number) ?? 512
    return {
      0: { type: 'LATENT', shape: [1, 4, h / 8, w / 8] },
    }
  },

  KSampler: async (node, _inputs, onProgress, ctx) => {
    const steps = (node.widgetValues[4] as number) ?? 20
    for (let i = 0; i <= steps; i++) {
      await delay(90, ctx.signal)
      onProgress(i / steps)
    }
    return {
      0: { type: 'LATENT', shape: [1, 4, 64, 64], steps },
    }
  },

  VAEDecode: async (_node, inputs, _onProgress, ctx) => {
    await delay(450, ctx.signal)
    const latent = inputs[0] as NodeOutput | undefined
    const shape = (latent?.shape as number[] | undefined) ?? [1, 4, 64, 64]
    return {
      0: { type: 'IMAGE', width: shape[3] * 8, height: shape[2] * 8 },
    }
  },

  SaveImage: async (node, inputs, _onProgress, ctx) => {
    await delay(150, ctx.signal)
    const prefix = (node.widgetValues[0] as string) ?? 'ComfyUI'
    const img = inputs[0] as NodeOutput | undefined
    return {
      0: {
        type: 'SAVED',
        path: `output/${prefix}_00001.png`,
        width: img?.width ?? '?',
        height: img?.height ?? '?',
      },
    }
  },

  AppInput: async (node) => {
    const text = String(node.widgetValues[0] ?? '')
    return {
      0: { type: 'TEXT', text },
    }
  },

  AppLlm: async (node, inputs, _onProgress, ctx) => {
    const wire = inputs[0] as (NodeOutput & { type?: string; text?: string }) | undefined
    const prompt = wire?.type === 'TEXT' ? String(wire.text ?? '') : ''
    if (prompt.length === 0) {
      throw new Error('No prompt: connect the Input node or type text in Input.')
    }
    const systemRaw = (node.widgetValues[0] as string) ?? ''
    const system = systemRaw.trim().length > 0 ? systemRaw : undefined
    const text = ctx.onStreamText
      ? await postCompleteStream(
          { prompt, system },
          { signal: ctx.signal, onToken: ctx.onStreamText },
        )
      : await postComplete({ prompt, system }, { signal: ctx.signal })
    return {
      0: { type: 'TEXT', text },
    }
  },

  AppOutput: async (_node, inputs) => {
    const v = inputs[0] as (NodeOutput & { type?: string }) | undefined
    if (v?.type === 'TEXT') {
      return { 0: { type: 'TEXT', text: String((v as { text?: string }).text ?? '') } }
    }
    return { 0: { type: 'TEXT', text: '' } }
  },

  /** 1 input → 2× TEXT (same) — fan-out. */
  AppTee: async (_node, inputs) => {
    const t = textFrom(inputs[0])
    return {
      0: { type: 'TEXT', text: t },
      1: { type: 'TEXT', text: t },
    }
  },

  /** 2 inputs → 1 TEXT (concat with separator). Fan-in. */
  AppJoin: async (node, inputs) => {
    const sep = String(node.widgetValues[0] ?? '\n')
    const a = textFrom(inputs[0])
    const b = textFrom(inputs[1])
    return { 0: { type: 'TEXT', text: `${a}${sep}${b}` } }
  },

  AppPrefix: async (node, inputs) => {
    const p = String(node.widgetValues[0] ?? '')
    return { 0: { type: 'TEXT', text: p + textFrom(inputs[0]) } }
  },

  /** Pass through input 0 or 1 (widget: '0' | '1'). */
  AppPick: async (node, inputs) => {
    const use1 =
      node.widgetValues[0] === '1' || node.widgetValues[0] === 1
    const t = textFrom(inputs[use1 ? 1 : 0])
    return { 0: { type: 'TEXT', text: t } }
  },

  /**
   * Lexical (BM25) or optional cosine (embeddings) retrieval over an in-node corpus;
   * returns numbered passages for downstream Join / LLM.
   */
  AppRetrieve: async (node, inputs, _onProgress, ctx) => {
    const query = textFrom(inputs[0])
    if (query.trim().length === 0) {
      throw new Error('Retrieve: connect a query (TEXT) input.')
    }
    const k = Math.min(10, Math.max(1, Math.floor(Number(node.widgetValues[0] ?? 3) || 3)))
    const corpusId = String(node.widgetValues[1] ?? 'corpus-default').trim()
    const corpus = useCorpusStore.getState().getBody(corpusId)
    if (corpus.length > 65_536) {
      throw new Error(
        'Retrieve: corpus is too large (max 64 KB). Shorten the text in the node.',
      )
    }
    const chunkSize = Math.max(10, Math.floor(Number(node.widgetValues[2] ?? 800) || 800))
    let chunkOverlap = Math.max(0, Math.floor(Number(node.widgetValues[3] ?? 100) || 100))
    if (chunkOverlap >= chunkSize) {
      chunkOverlap = Math.max(0, chunkSize - 1)
    }
    const simRaw = String(node.widgetValues[4] ?? 'bm25').toLowerCase()
    const mode: 'bm25' | 'cosine' = simRaw === 'cosine' ? 'cosine' : 'bm25'
    if (mode === 'cosine' && preferServerCosineRetrieval()) {
      if (serverSyncEnabled()) {
        const entry = useCorpusStore.getState().getEntry(corpusId)
        if (entry != null) {
          try {
            await syncCorpusToServer(entry)
          } catch {
            // retrieveFromServer may still explain missing corpus / DB
          }
        }
      }
      try {
        const { rows, fallbackNote } = await retrieveFromServer(
          corpusId,
          query,
          k,
          ctx.signal,
        )
        const top = rows
        const citationInstructions =
          "Cite the passages you use as [1], [2], … (numbers match Passage [n] below). " +
          "If the Context does not contain enough information to answer, reply exactly: I don't know."
        const head = fallbackNote != null ? `[retrieval: ${fallbackNote}]\n\n` : ''
        const body = top
          .map((r, i) => {
            const n = i + 1
            return `Passage [${n}] — ${formatCitationLabel(r)} (score ${r.score.toFixed(4)})\n${r.text}`
          })
          .join('\n\n---\n\n')
        const text = head + citationInstructions + '\n\n---\n\n' + body
        return {
          0: {
            type: 'TEXT',
            text,
            retrieveHits: top.map((r, i) => ({
              citationIndex: i + 1,
              label: formatCitationLabel(r),
              source: r.source,
              score: r.score,
            })),
          } as NodeOutput,
        }
      } catch (e) {
        if (!cosineClientFallbackEnabled()) {
          const detail = e instanceof Error ? e.message : String(e)
          const corpusHint = /No corpus\b|corpus_not_found/i.test(detail)
          const tail = corpusHint
            ? 'Enable VITE_SYNC_SERVER=1 on the client build, sign in (Clerk JWT), and redeploy; or set VITE_COSINE_CLIENT_FALLBACK=1 for in-browser cosine.'
            : 'Ensure DATABASE_URL on the API, corpora synced (VITE_SYNC_SERVER), embeddings (OPENAI_API_KEY on API or POST /api/corpora/<id>/embed), or VITE_COSINE_CLIENT_FALLBACK=1.'
          throw new Error(
            `Retrieve (cosine): server path failed and client fallback is disabled. ${detail} ${tail}`,
            { cause: e },
          )
        }
        const reason = e instanceof Error ? e.message : String(e)
        const chunks = chunkCorpus(corpus, { chunkSize, chunkOverlap })
        if (chunks.length === 0) {
          throw new Error(
            'Retrieve: corpus is empty. Paste documents (use --- between docs) or keep the default sample.',
            { cause: e },
          )
        }
        const { rows, fallbackNote } = await rankChunksForQuery(
          query,
          chunks,
          'cosine',
          ctx.signal,
        )
        const top = rows.slice(0, k)
        const note =
          `Server retrieve failed (${reason}); used in-browser cosine (embeddings may cache in IndexedDB). ` +
          (fallbackNote != null ? fallbackNote : '')
        const citationInstructions =
          "Cite the passages you use as [1], [2], … (numbers match Passage [n] below). " +
          "If the Context does not contain enough information to answer, reply exactly: I don't know."
        const head = `[retrieval: ${note}]\n\n`
        const body = top
          .map((r, i) => {
            const n = i + 1
            return `Passage [${n}] — ${formatCitationLabel(r)} (score ${r.score.toFixed(4)})\n${r.text}`
          })
          .join('\n\n---\n\n')
        const text = head + citationInstructions + '\n\n---\n\n' + body
        return {
          0: {
            type: 'TEXT',
            text,
            retrieveHits: top.map((r, i) => ({
              citationIndex: i + 1,
              label: formatCitationLabel(r),
              source: r.source,
              score: r.score,
            })),
          } as NodeOutput,
        }
      }
    }
    const chunks = chunkCorpus(corpus, { chunkSize, chunkOverlap })
    if (chunks.length === 0) {
      throw new Error(
        'Retrieve: corpus is empty. Paste documents (use --- between docs) or keep the default sample.',
      )
    }
    const { rows, fallbackNote } = await rankChunksForQuery(
      query,
      chunks,
      mode,
      ctx.signal,
    )
    const top = rows.slice(0, k)
    const citationInstructions =
      "Cite the passages you use as [1], [2], … (numbers match Passage [n] below). " +
      "If the Context does not contain enough information to answer, reply exactly: I don't know."
    const head = fallbackNote != null ? `[retrieval: ${fallbackNote}]\n\n` : ''
    const body = top
      .map((r, i) => {
        const n = i + 1
        return `Passage [${n}] — ${formatCitationLabel(r)} (score ${r.score.toFixed(4)})\n${r.text}`
      })
      .join('\n\n---\n\n')
    const text = head + citationInstructions + '\n\n---\n\n' + body
    return {
      0: {
        type: 'TEXT',
        text,
        retrieveHits: top.map((r, i) => ({
          citationIndex: i + 1,
          label: formatCitationLabel(r),
          source: r.source,
          score: r.score,
        })),
      } as NodeOutput,
    }
  },
}

const fallbackExecutor: ExecutorFn = async (_node, _inputs, _onProgress, ctx) => {
  await delay(200, ctx.signal)
  return {}
}

export function getExecutor(type: string): ExecutorFn {
  return executors[type] ?? fallbackExecutor
}
