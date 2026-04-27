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

export function getPool(): pg.Pool | null {
  const url = getDatabaseUrl()
  if (!url) {
    return null
  }
  if (!_pool) {
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
