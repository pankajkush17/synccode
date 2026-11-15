import { DocKeys } from '@synccode/shared'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import * as Y from 'yjs'
import { Logger } from '../../src/logging/Logger'
import { CompactionJob } from '../../src/persistence/CompactionJob'
import { Database } from '../../src/persistence/Database'
import { RoomRepository, SlugTakenError } from '../../src/persistence/RoomRepository'
import { SnapshotRepository } from '../../src/persistence/SnapshotRepository'
import { UpdateRepository } from '../../src/persistence/UpdateRepository'
import { RoomHydrator } from '../../src/rooms/RoomHydrator'
import { SlugGenerator } from '../../src/rooms/SlugGenerator'

describe('persistence (real Postgres)', () => {
  let database: Database
  let rooms: RoomRepository
  let updates: UpdateRepository
  let snapshots: SnapshotRepository
  let hydrator: RoomHydrator
  const slugs = new SlugGenerator()

  beforeAll(() => {
    database = new Database(inject('databaseUrl'))
    rooms = new RoomRepository(database)
    updates = new UpdateRepository(database)
    snapshots = new SnapshotRepository(database)
    hydrator = new RoomHydrator(snapshots, updates)
  })

  afterAll(async () => {
    await database.close()
  })

  const newRoom = () => rooms.create({ slug: slugs.generate(), editTokenHash: 'hash' })

  /** Types `count` characters one at a time, returning each incremental update. */
  function typeUpdates(doc: Y.Doc, count: number, char = 'a'): Uint8Array[] {
    const out: Uint8Array[] = []
    const capture = (u: Uint8Array) => out.push(u)
    doc.on('update', capture)
    const text = doc.getText(DocKeys.CONTENT)
    for (let i = 0; i < count; i++) text.insert(text.length, char)
    doc.off('update', capture)
    return out
  }

  function compactionJob(): CompactionJob {
    return new CompactionJob(
      database,
      snapshots,
      updates,
      hydrator,
      () => [],
      { intervalMs: 60_000, threshold: 10 },
      Logger.silent(),
    )
  }

  it('creates and finds rooms, and reports slug collisions', async () => {
    const room = await newRoom()
    expect(room.language).toBe('typescript')
    expect((await rooms.findBySlug(room.slug))?.id).toBe(room.id)
    expect(await rooms.findBySlug('nonexistent')).toBeNull()
    await expect(rooms.create({ slug: room.slug, editTokenHash: 'x' })).rejects.toBeInstanceOf(
      SlugTakenError,
    )
  })

  it('touch() updates activity and metadata', async () => {
    const room = await newRoom()
    await rooms.touch(room.id, { language: 'go', title: 'Pairing' })
    const after = await rooms.findBySlug(room.slug)
    expect(after?.language).toBe('go')
    expect(after?.title).toBe('Pairing')
    expect(after!.lastActiveAt.getTime()).toBeGreaterThanOrEqual(room.lastActiveAt.getTime())
  })

  it('stores binary updates byte-for-byte and streams them in order, in batches', async () => {
    const room = await newRoom()
    const source = new Y.Doc()
    const written = typeUpdates(source, 25)
    await updates.appendBatch(room.id, written)
    await updates.appendBatch(room.id, []) // no-op

    const batches: number[] = []
    const read: Uint8Array[] = []
    for await (const batch of updates.stream(room.id, { batchSize: 10 })) {
      batches.push(batch.length)
      for (const row of batch) read.push(row.update)
    }
    expect(batches).toEqual([10, 10, 5])
    expect(read.map((u) => Array.from(u))).toEqual(written.map((u) => Array.from(u)))
    expect(await updates.countForRoom(room.id)).toBe(25)
  })

  it('hydrates a document from the update log alone', async () => {
    const room = await newRoom()
    const source = new Y.Doc()
    await updates.appendBatch(room.id, typeUpdates(source, 40))

    const doc = new Y.Doc()
    const result = await hydrator.hydrate(room.id, doc)
    expect(result).toEqual({ hadSnapshot: false, updatesApplied: 40 })
    expect(doc.getText(DocKeys.CONTENT).toString()).toBe('a'.repeat(40))
  })

  it('hydrating an empty room yields an empty document', async () => {
    const room = await newRoom()
    const doc = new Y.Doc()
    expect(await hydrator.hydrate(room.id, doc)).toEqual({ hadSnapshot: false, updatesApplied: 0 })
    expect(doc.getText(DocKeys.CONTENT).toString()).toBe('')
  })

  it('compaction folds the log into one snapshot without changing the document', async () => {
    const room = await newRoom()
    const source = new Y.Doc()
    await updates.appendBatch(room.id, typeUpdates(source, 50))

    expect(await compactionJob().compactRoom(room.id)).toBe('compacted')
    expect(await updates.countForRoom(room.id)).toBe(0)
    expect(await snapshots.findLatest(room.id)).not.toBeNull()

    // Edits after the snapshot land in the log again…
    await updates.appendBatch(room.id, typeUpdates(source, 5, 'b'))
    const doc = new Y.Doc()
    const result = await hydrator.hydrate(room.id, doc)
    expect(result).toEqual({ hadSnapshot: true, updatesApplied: 5 })
    expect(doc.getText(DocKeys.CONTENT).toString()).toBe('a'.repeat(50) + 'b'.repeat(5))

    // …and a second compaction replaces the snapshot rather than stacking them.
    expect(await compactionJob().compactRoom(room.id)).toBe('compacted')
    const again = new Y.Doc()
    expect(await hydrator.hydrate(room.id, again)).toEqual({ hadSnapshot: true, updatesApplied: 0 })
    expect(again.getText(DocKeys.CONTENT).toString()).toBe(
      source.getText(DocKeys.CONTENT).toString(),
    )
  })

  it('compaction of an empty log is a no-op', async () => {
    const room = await newRoom()
    expect(await compactionJob().compactRoom(room.id)).toBe('skipped-empty')
    expect(await snapshots.findLatest(room.id)).toBeNull()
  })

  it('never loses updates appended while compaction runs', async () => {
    const room = await newRoom()
    const source = new Y.Doc()
    await updates.appendBatch(room.id, typeUpdates(source, 200))

    const job = compactionJob()
    const writers: Promise<void>[] = []
    const compactions: Promise<unknown>[] = []
    for (let round = 0; round < 10; round++) {
      writers.push(updates.appendBatch(room.id, typeUpdates(source, 20, 'c')))
      compactions.push(job.compactRoom(room.id))
    }
    await Promise.all([...writers, ...compactions])

    const doc = new Y.Doc()
    await hydrator.hydrate(room.id, doc)
    expect(doc.getText(DocKeys.CONTENT).toString()).toBe(source.getText(DocKeys.CONTENT).toString())
    expect(doc.getText(DocKeys.CONTENT).length).toBe(400)
  })

  it('the scheduled pass only compacts rooms over the threshold', async () => {
    const busy = await newRoom()
    const quiet = await newRoom()
    await updates.appendBatch(busy.id, typeUpdates(new Y.Doc(), 30))
    await updates.appendBatch(quiet.id, typeUpdates(new Y.Doc(), 3))

    const job = new CompactionJob(
      database,
      snapshots,
      updates,
      hydrator,
      () => [busy, quiet],
      { intervalMs: 60_000, threshold: 10 },
      Logger.silent(),
    )
    await job.runOnce()

    expect(await updates.countForRoom(busy.id)).toBe(0)
    expect(await updates.countForRoom(quiet.id)).toBe(3)
    expect(await snapshots.findLatest(quiet.id)).toBeNull()
  })
})
