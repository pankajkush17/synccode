import type { DbExecutor } from '@synccode/db'
import * as Y from 'yjs'
import type { SnapshotRepository } from '../persistence/SnapshotRepository'
import type { UpdateRepository } from '../persistence/UpdateRepository'
import { UpdateOrigin } from './UpdateOrigin'

export interface HydrateOptions {
  /** Only replay updates with `id <= upToId` (used by compaction for a consistent cut). */
  readonly upToId?: number
  readonly executor?: DbExecutor
}

export interface HydrationResult {
  readonly hadSnapshot: boolean
  readonly updatesApplied: number
}

/**
 * Rebuilds a Y.Doc from Postgres: latest snapshot first, then every update row
 * still in the log. Compaction deletes the rows a snapshot covers in the same
 * transaction that writes it, and Yjs updates are idempotent, so "snapshot +
 * whatever is left in the log" is always the complete document.
 */
export class RoomHydrator {
  constructor(
    private readonly snapshots: SnapshotRepository,
    private readonly updates: UpdateRepository,
  ) {}

  async hydrate(
    roomId: string,
    doc: Y.Doc,
    options: HydrateOptions = {},
  ): Promise<HydrationResult> {
    const snap = await this.snapshots.findLatest(roomId, options.executor)
    if (snap) Y.applyUpdate(doc, snap.state, UpdateOrigin.HYDRATE)

    let updatesApplied = 0
    const stream = this.updates.stream(roomId, {
      upToId: options.upToId,
      executor: options.executor,
    })
    for await (const batch of stream) {
      // One transaction per batch: a single observer pass instead of one per row.
      doc.transact(() => {
        for (const row of batch) Y.applyUpdate(doc, row.update, UpdateOrigin.HYDRATE)
      }, UpdateOrigin.HYDRATE)
      updatesApplied += batch.length
    }

    return { hadSnapshot: snap !== null, updatesApplied }
  }
}
