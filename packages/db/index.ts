import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import * as schema from './schema'

export * from './schema'
export { schema }

export type Db = NodePgDatabase<typeof schema>
/** Either the root database or a transaction handle — repositories accept both. */
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>

export interface DbHandle {
  readonly db: Db
  readonly pool: pg.Pool
}

export interface CreateDbOptions {
  readonly maxConnections?: number
}

function sslFor(url: string): pg.PoolConfig['ssl'] {
  // Hosted Postgres (Neon etc.) requires TLS; local and docker instances do not offer it.
  return /sslmode=(require|verify-full|verify-ca)/.test(url)
    ? { rejectUnauthorized: true }
    : undefined
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    ssl: sslFor(url),
  })
  return { db: drizzle(pool, { schema }), pool }
}

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/** Applies every pending migration. Safe to call on every boot — it is idempotent. */
export async function runMigrations(url: string, migrationsFolder = MIGRATIONS_DIR): Promise<void> {
  const { db, pool } = createDb(url, { maxConnections: 1 })
  try {
    await migrate(db, { migrationsFolder })
  } finally {
    await pool.end()
  }
}
