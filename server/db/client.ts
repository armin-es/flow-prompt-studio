import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { config } from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import * as schema from './schema.js'

config()

const __dirname = dirname(fileURLToPath(import.meta.url))

let _pool: pg.Pool | null = null
let _db: NodePgDatabase<typeof schema> | null = null
let _migrated = false

export function getDatabaseUrl(): string | undefined {
  const u = process.env.DATABASE_URL?.trim()
  return u && u.length > 0 ? u : undefined
}

function warnIfSupabaseTransactionPooler(url: string): void {
  try {
    const u = new URL(url.replace(/^postgresql:/i, 'postgres:'))
    if (u.hostname.includes('pooler.supabase.com') && u.port === '6543') {
      console.warn(
        '[flow-prompt-studio] DATABASE_URL uses Supabase transaction pooler (port 6543). node-pg uses prepared statements; use the Direct connection string (db.*.supabase.co:5432) or Session pooler instead — see DEPLOY.md.',
      )
    }
  } catch {
    // ignore URL parse errors
  }
}

export function getPool(): pg.Pool | null {
  const url = getDatabaseUrl()
  if (!url) {
    return null
  }
  if (!_pool) {
    warnIfSupabaseTransactionPooler(url)
    _pool = new pg.Pool({ connectionString: url, max: 8 })
  }
  return _pool
}

export function getDb(): NodePgDatabase<typeof schema> | null {
  const pool = getPool()
  if (!pool) {
    return null
  }
  if (!_db) {
    _db = drizzle(pool, { schema })
  }
  return _db
}

export type Db = NonNullable<ReturnType<typeof getDb>>

export async function runMigrationsIfNeeded(): Promise<void> {
  const url = getDatabaseUrl()
  if (!url || _migrated) {
    return
  }
  const pool = getPool()!
  const migrationsFolder = join(__dirname, '../../drizzle')
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder })
  _migrated = true
}

export { schema }
