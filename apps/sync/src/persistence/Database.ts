import { createDb, type Db, type DbExecutor, type DbHandle, runMigrations } from '@synccode/db'
import { sql } from 'drizzle-orm'

/** Holds the Drizzle instance and its connection pool for the process lifetime. */
export class Database {
  private readonly handle: DbHandle
  private closed = false

  constructor(private readonly url: string) {
    this.handle = createDb(url)
  }

  get db(): Db {
    return this.handle.db
  }

  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.handle.db.transaction((tx) => fn(tx))
  }

  migrate(): Promise<void> {
    return runMigrations(this.url)
  }

  async ping(): Promise<boolean> {
    try {
      await this.handle.db.execute(sql`select 1`)
      return true
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.handle.pool.end()
  }
}
