/**
 * Standalone compaction: folds every room's update log into a fresh snapshot.
 *
 * The same CompactionJob runs inside each sync node for rooms that are hot.
 * This script covers the rest — rooms nobody has open — and is safe to run at
 * any time, including while nodes are serving traffic (per-room advisory lock).
 *
 *   DATABASE_URL=… pnpm compact            # rooms with more than 1000 updates
 *   DATABASE_URL=… pnpm compact --min 0    # every room that has any update
 */
import { Logger } from '../apps/sync/src/logging/Logger'
import { CompactionJob } from '../apps/sync/src/persistence/CompactionJob'
import { Database } from '../apps/sync/src/persistence/Database'
import { SnapshotRepository } from '../apps/sync/src/persistence/SnapshotRepository'
import { UpdateRepository } from '../apps/sync/src/persistence/UpdateRepository'
import { RoomHydrator } from '../apps/sync/src/rooms/RoomHydrator'

function threshold(): number {
  const flag = process.argv.indexOf('--min')
  const value = flag >= 0 ? Number(process.argv[flag + 1]) : 1000
  if (!Number.isInteger(value) || value < 0) throw new Error('--min expects a non-negative integer')
  return value
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const database = new Database(url)
const updates = new UpdateRepository(database)
const snapshots = new SnapshotRepository(database)
const job = new CompactionJob(
  database,
  snapshots,
  updates,
  new RoomHydrator(snapshots, updates),
  () => [],
  { intervalMs: 0, threshold: threshold() },
  Logger.create({ level: process.env.LOG_LEVEL ?? 'warn' }),
)

try {
  const roomIds = await updates.roomIdsOverThreshold(threshold())
  const tally = { compacted: 0, 'skipped-empty': 0, 'skipped-locked': 0 }
  for (const roomId of roomIds) tally[await job.compactRoom(roomId)]++
  console.log(
    `${roomIds.length} room(s) over the threshold: ${tally.compacted} compacted, ` +
      `${tally['skipped-locked']} busy on another node, ${tally['skipped-empty']} already empty`,
  )
} catch (err) {
  console.error('Compaction failed:', err)
  process.exitCode = 1
} finally {
  await database.close()
}
