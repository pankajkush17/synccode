import { type DbExecutor, documentUpdates } from '@synccode/db'
import { and, asc, count, eq, gt, lte, max } from 'drizzle-orm'
import type { Database } from './Database'

export interface StoredUpdate {
  readonly id: number
  readonly update: Uint8Array
}

export interface StreamOptions {
  /** Only rows with `id > afterId`. */
  readonly afterId?: number
  /** Only rows with `id <= upToId`. */
  readonly upToId?: number
  readonly batchSize?: number
  readonly executor?: DbExecutor
}

/** The append-only `document_updates` log. Rows are only ever inserted or pruned. */
export class UpdateRepository {
  static readonly DEFAULT_BATCH_SIZE = 500

  constructor(private readonly database: Database) {}

  /** One multi-row INSERT for the whole batch. */
  async appendBatch(roomId: string, updates: readonly Uint8Array[]): Promise<void> {
    if (updates.length === 0) return
    await this.database.db
      .insert(documentUpdates)
      .values(updates.map((update) => ({ roomId, update })))
  }

  /**
   * Keyset-paginated stream in insertion order. A hot room can hold thousands
   * of unmerged updates between snapshots; this keeps memory flat.
   */
  async *stream(roomId: string, options: StreamOptions = {}): AsyncGenerator<StoredUpdate[]> {
    const executor = options.executor ?? this.database.db
    const batchSize = options.batchSize ?? UpdateRepository.DEFAULT_BATCH_SIZE
    let cursor = options.afterId ?? 0

    for (;;) {
      const batch = await executor
        .select({ id: documentUpdates.id, update: documentUpdates.update })
        .from(documentUpdates)
        .where(
          and(
            eq(documentUpdates.roomId, roomId),
            gt(documentUpdates.id, cursor),
            options.upToId === undefined ? undefined : lte(documentUpdates.id, options.upToId),
          ),
        )
        .orderBy(asc(documentUpdates.id))
        .limit(batchSize)

      if (batch.length === 0) return
      yield batch
      if (batch.length < batchSize) return
      cursor = batch[batch.length - 1]!.id
    }
  }

  async countForRoom(roomId: string, executor: DbExecutor = this.database.db): Promise<number> {
    const [row] = await executor
      .select({ value: count() })
      .from(documentUpdates)
      .where(eq(documentUpdates.roomId, roomId))
    return row?.value ?? 0
  }

  /** Rooms whose update log has more than `threshold` rows — the offline compaction work list. */
  async roomIdsOverThreshold(threshold: number): Promise<string[]> {
    const rows = await this.database.db
      .select({ roomId: documentUpdates.roomId })
      .from(documentUpdates)
      .groupBy(documentUpdates.roomId)
      .having(gt(count(), threshold))
    return rows.map((row) => row.roomId)
  }

  async maxId(roomId: string, executor: DbExecutor = this.database.db): Promise<number | null> {
    const [row] = await executor
      .select({ value: max(documentUpdates.id) })
      .from(documentUpdates)
      .where(eq(documentUpdates.roomId, roomId))
    return row?.value ?? null
  }

  async deleteUpTo(
    roomId: string,
    upToId: number,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .delete(documentUpdates)
      .where(and(eq(documentUpdates.roomId, roomId), lte(documentUpdates.id, upToId)))
  }
}
