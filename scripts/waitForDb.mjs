/**
 * Wait until something accepts TCP on the host:port from DATABASE_URL
 * (default 127.0.0.1:5433 to match docker-compose). Used before drizzle-kit
 * so Studio/migrate do not hit ECONNREFUSED while Postgres is still starting.
 */
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: join(here, '../.env') })

function target() {
  const u = process.env.DATABASE_URL
  if (u == null || u.length === 0) {
    return { host: '127.0.0.1', port: 5433 }
  }
  try {
    const p = new URL(u)
    const port = p.port ? Number(p.port) : 5432
    return { host: p.hostname || '127.0.0.1', port: Number.isFinite(port) ? port : 5433 }
  } catch {
    return { host: '127.0.0.1', port: 5433 }
  }
}

function tryConnect(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port, timeout: 3_000 }, () => {
      s.end()
      resolve()
    })
    s.on('error', reject)
  })
}

const { host, port } = target()
const maxMs = 45_000
const stepMs = 300
const start = Date.now()

while (Date.now() - start < maxMs) {
  try {
    await tryConnect(host, port)
    console.log(`[waitForDb] ${host}:${port} is accepting connections.`)
    process.exit(0)
  } catch {
    process.stdout.write('.')
  }
  await delay(stepMs)
}

console.error(
  `\n[waitForDb] Timed out after ${maxMs}ms. Is Docker running? Try: docker compose up -d\n`,
)
process.exit(1)
