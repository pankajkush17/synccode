import { type DbExecutor, documentSnapshots, type SnapshotRow } from '@synccode/db'
import { and, desc, eq, ne } from 'drizzle-orm'
import type { Database } from './Database'

/** The `document_snapshots` table: one compacted full-document state per room. */
export class SnapshotRepository {
  constructor(private readonly database: Database) {}

  async findLatest(
    roomId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<SnapshotRow | null> {
    const [row] = await executor
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.roomId, roomId))
      .orderBy(desc(documentSnapshots.createdAt))
      .limit(1)
    return row ?? null
  }

  async insert(
    roomId: string,
    state: Uint8Array,
    executor: DbExecutor = this.database.db,
  ): Promise<SnapshotRow> {
    const [row] = await executor.insert(documentSnapshots).values({ roomId, state }).returning()
    return row!
  }

  /** Removes every snapshot of the room except `keepId`. */
  async deleteAllExcept(
    roomId: string,
    keepId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .delete(documentSnapshots)
      .where(and(eq(documentSnapshots.roomId, roomId), ne(documentSnapshots.id, keepId)))
  }
}
