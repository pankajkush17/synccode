import { sql } from 'drizzle-orm'
import * as Y from 'yjs'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import type { RoomHydrator } from '../rooms/RoomHydrator'
import type { Database } from './Database'
import type { SnapshotRepository } from './SnapshotRepository'
import type { UpdateRepository } from './UpdateRepository'

export interface CompactionTarget {
  readonly id: string
  readonly slug: string
}

export interface CompactionOptions {
  readonly intervalMs: number
  /** Compact a room once it has more than this many update rows. */
  readonly threshold: number
}

export type CompactionOutcome = 'compacted' | 'skipped-empty' | 'skipped-locked'

/**
 * Folds the append-only update log into a single snapshot.
 *
 * The snapshot is built from Postgres alone (previous snapshot + every update
 * up to a fixed id), inside one transaction that also deletes exactly those
 * rows. It never reads a node's in-memory document, so it cannot lose an update
 * that another node wrote but this node has not seen. A per-room advisory lock
 * keeps two nodes from compacting the same room at once.
 */
export class CompactionJob {
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null

  constructor(
    private readonly database: Database,
    private readonly snapshots: SnapshotRepository,
    private readonly updates: UpdateRepository,
    private readonly hydrator: RoomHydrator,
    private readonly targets: () => Iterable<CompactionTarget>,
    private readonly options: CompactionOptions,
    private readonly logger: Logger,
    private readonly metrics?: MetricsRegistry,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.runOnce(), this.options.intervalMs)
    this.timer.unref()
  }

  /** Stops the schedule and waits for an in-flight pass to finish. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.running
  }

  /** One pass over every hot room. Passes never overlap. */
  runOnce(): Promise<void> {
    this.running ??= this.pass().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async pass(): Promise<void> {
    for (const target of [...this.targets()]) {
      try {
        const pending = await this.updates.countForRoom(target.id)
        if (pending > this.options.threshold) await this.compactRoom(target.id)
      } catch (err) {
        this.logger.error('compaction failed', { err, roomSlug: target.slug })
      }
    }
  }

  async compactRoom(roomId: string): Promise<CompactionOutcome> {
    const outcome = await this.database.transaction<CompactionOutcome>(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${roomId}, 0)) as locked`,
      )
      if (!lock.rows[0]?.locked) return 'skipped-locked'

      // The cut: everything at or below this id goes into the snapshot and is then pruned.
      const upToId = await this.updates.maxId(roomId, tx)
      if (upToId === null) return 'skipped-empty'

      const doc = new Y.Doc({ gc: true })
      try {
        await this.hydrator.hydrate(roomId, doc, { upToId, executor: tx })
        const snapshot = await this.snapshots.insert(roomId, Y.encodeStateAsUpdate(doc), tx)
        await this.updates.deleteUpTo(roomId, upToId, tx)
        await this.snapshots.deleteAllExcept(roomId, snapshot.id, tx)
      } finally {
        doc.destroy()
      }
      return 'compacted'
    })

    if (outcome === 'compacted') {
      this.metrics?.compactions.inc()
      this.logger.info('room compacted', { roomId })
    }
    return outcome
  }
}
