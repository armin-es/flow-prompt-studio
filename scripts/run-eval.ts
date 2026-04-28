/**
 * Stage-D4 eval harness: recall@K + MRR vs gold chunk keys.
 *
 * Usage:
 *   npm run eval                    # BM25 only (no API key; CI-safe)
 *   npm run eval -- --cosine       # OpenAI embeddings (needs OPENAI_API_KEY)
 *   npm run eval -- data/evals/custom.json
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EvalManifestJson } from '../src/eval/runEvalSuite.ts'
import { formatSuiteReport, runEvalSuite } from '../src/eval/runEvalSuite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const cosine = argv.includes('--cosine')
  const jsonArg = argv.find((a) => a.endsWith('.json'))
  const manifestPath =
    jsonArg != null ? join(root, jsonArg) : join(root, 'data/evals/default.json')

  const raw = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(raw) as EvalManifestJson
  const mode = cosine ? 'cosine' : 'bm25'

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 180_000)

  try {
    const result = await runEvalSuite(manifest, mode, ac.signal)
    console.log(formatSuiteReport(result))
  } finally {
    clearTimeout(t)
  }
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
