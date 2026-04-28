/**
 * Eval harness:
 *  1. Retrieval: recall@K + MRR vs gold chunk keys (`data/evals/default.json`).
 *  2. Graph presets: Vitest smoke (`src/eval/graphSmoke.test.ts`) — RAG + Agent
 *     executor chains with mocks (no live HTTP).
 *
 * Usage:
 *   npm run eval                      # BM25 retrieval + graph smoke tests
 *   npm run eval -- --retrieval-only  # retrieval metrics only
 *   npm run eval -- --cosine          # cosine retrieval (needs OPENAI_API_KEY)
 *   npm run eval -- data/evals/custom.json
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EvalManifestJson } from '../src/eval/runEvalSuite.ts'
import { formatSuiteReport, runEvalSuite } from '../src/eval/runEvalSuite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const retrievalOnly = argv.includes('--retrieval-only')
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
    console.log('')
  } finally {
    clearTimeout(t)
  }

  if (!retrievalOnly) {
    console.log('Graph preset smoke (Vitest)…')
    const r = spawnSync('npx', ['vitest', 'run', 'src/eval/graphSmoke.test.ts'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })
    if (r.status !== 0 && r.status != null) {
      process.exit(r.status)
    }
    if (r.error) {
      throw r.error
    }
  }
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
