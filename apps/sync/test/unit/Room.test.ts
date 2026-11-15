import { DocKeys } from '@synccode/shared'
import { describe, expect, it } from 'vitest'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'
import { ProtocolError } from '../../src/errors'
import { UpdateOrigin } from '../../src/rooms/UpdateOrigin'
import { createRoomFixture, FakeHub, FakeSession } from '../helpers/fakes'
import { sleep, waitFor } from '../helpers/waitFor'

/** An update produced by an independent client document. */
function clientEdit(text: string): { doc: Y.Doc; update: Uint8Array } {
  const doc = new Y.Doc()
  doc.getText(DocKeys.CONTENT).insert(0, text)
  return { doc, update: Y.encodeStateAsUpdate(doc) }
}

describe('Room', () => {
  it('fans a client update out to the other sessions and to the bus, not back to the sender', () => {
    const { room, bus } = createRoomFixture()
    const sender = new FakeSession()
    const other = new FakeSession()
    room.attach(sender.asSession())
    room.attach(other.asSession())

    room.applyRemoteUpdate(clientEdit('hello').update, sender.asSession())

    expect(room.doc.getText(DocKeys.CONTENT).toString()).toBe('hello')
    expect(sender.updates).toHaveLength(0)
    expect(other.updates).toHaveLength(1)
    expect(bus.published.filter((m) => m.kind === 'update')).toHaveLength(1)
  })

  it('delivers a Redis update to every local session without re-publishing or persisting it', async () => {
    const { room, bus, updates } = createRoomFixture()
    const a = new FakeSession()
    room.attach(a.asSession())

    room.applyRemoteUpdate(clientEdit('from another node').update, UpdateOrigin.REDIS)
    await room.flush()

    expect(a.updates).toHaveLength(1)
    expect(bus.published).toHaveLength(0)
    expect(updates.all).toHaveLength(0)
    expect(room.hasUnflushedChanges).toBe(false)
  })

  it('debounces persistence into one batched write', async () => {
    const { room, updates } = createRoomFixture({ flushIntervalMs: 30 })
    const session = new FakeSession()
    const doc = new Y.Doc()
    const emitted: Uint8Array[] = []
    doc.on('update', (u: Uint8Array) => emitted.push(u))
    for (const ch of 'abcde')
      doc.getText(DocKeys.CONTENT).insert(doc.getText(DocKeys.CONTENT).length, ch)

    for (const update of emitted) room.applyRemoteUpdate(update, session.asSession())
    expect(updates.batches).toHaveLength(0)

    await waitFor(() => updates.batches.length > 0, 'debounced flush')
    expect(updates.batches).toHaveLength(1)
    expect(updates.batches[0]).toHaveLength(5)
  })

  it('keeps a failed batch and retries it in order', async () => {
    const { room, updates } = createRoomFixture({ flushIntervalMs: 10 })
    const session = new FakeSession()
    updates.failNext = 1

    room.applyRemoteUpdate(clientEdit('first').update, session.asSession())
    await room.flush()
    expect(updates.all).toHaveLength(0)
    expect(room.hasUnflushedChanges).toBe(true)

    await waitFor(() => updates.all.length === 1, 'retried flush')
    const restored = new Y.Doc()
    for (const u of updates.all) Y.applyUpdate(restored, u)
    expect(restored.getText(DocKeys.CONTENT).toString()).toBe('first')
  })

  it('answers sync step 1 with the diff, and with its own step 1 only for writers', () => {
    const { room } = createRoomFixture()
    room.applyRemoteUpdate(clientEdit('server state').update, UpdateOrigin.REDIS)

    const writer = new FakeSession(true)
    const reader = new FakeSession(false)
    room.handleSyncStep1(writer.asSession(), Y.encodeStateVector(new Y.Doc()))
    room.handleSyncStep1(reader.asSession(), Y.encodeStateVector(new Y.Doc()))

    const caughtUp = new Y.Doc()
    Y.applyUpdate(caughtUp, writer.syncStep2[0]!)
    expect(caughtUp.getText(DocKeys.CONTENT).toString()).toBe('server state')
    expect(writer.syncStep1).toHaveLength(1)
    expect(reader.syncStep2).toHaveLength(1)
    expect(reader.syncStep1).toHaveLength(0)
  })

  it('sends only what the client is missing', () => {
    const { room } = createRoomFixture()
    const { doc, update } = clientEdit('x'.repeat(5000))
    room.applyRemoteUpdate(update, UpdateOrigin.REDIS)

    const upToDate = new FakeSession()
    room.handleSyncStep1(upToDate.asSession(), Y.encodeStateVector(doc))
    expect(upToDate.syncStep2[0]!.byteLength).toBeLessThan(10)
  })

  it('rejects malformed input as ProtocolError', () => {
    const { room } = createRoomFixture()
    const session = new FakeSession()
    const garbage = new Uint8Array([255, 255, 255, 255, 255])
    expect(() => room.applyRemoteUpdate(garbage, session.asSession())).toThrow(ProtocolError)
    expect(() => room.applyAwareness(garbage, session.asSession())).toThrow(ProtocolError)
  })

  it('tracks a session’s awareness and removes it when the session detaches', () => {
    const { room, bus } = createRoomFixture()
    const a = new FakeSession()
    const b = new FakeSession()
    room.attach(a.asSession())
    room.attach(b.asSession())

    const clientDoc = new Y.Doc()
    const clientAwareness = new awarenessProtocol.Awareness(clientDoc)
    clientAwareness.setLocalState({ user: { name: 'Ada', color: '#fff' } })
    room.applyAwareness(
      awarenessProtocol.encodeAwarenessUpdate(clientAwareness, [clientDoc.clientID]),
      a.asSession(),
    )

    expect(room.awareness.getStates().has(clientDoc.clientID)).toBe(true)
    expect(a.controlledClientIds).toEqual([clientDoc.clientID])
    expect(a.awareness).toHaveLength(0)
    expect(b.awareness).toHaveLength(1)

    room.detach(a.asSession())
    expect(room.awareness.getStates().has(clientDoc.clientID)).toBe(false)
    expect(b.awareness).toHaveLength(2)
    expect(bus.published.filter((m) => m.kind === 'awareness')).toHaveLength(2)
    clientAwareness.destroy()
  })

  it('greets a new session with AUTH_ACK and the current presence', () => {
    const { room } = createRoomFixture()
    const first = new FakeSession()
    room.attach(first.asSession())
    expect(first.authAcks).toBe(1)
    expect(first.awareness).toHaveLength(0) // nobody else is here; the server is not a peer

    const clientDoc = new Y.Doc()
    const clientAwareness = new awarenessProtocol.Awareness(clientDoc)
    clientAwareness.setLocalState({ user: { name: 'Ada', color: '#fff' } })
    room.applyAwareness(
      awarenessProtocol.encodeAwarenessUpdate(clientAwareness, [clientDoc.clientID]),
      first.asSession(),
    )

    const second = new FakeSession()
    room.attach(second.asSession())
    expect(second.awareness).toHaveLength(1)
    clientAwareness.destroy()
  })

  it('mirrors synced room settings into the rooms table, ignoring invalid values', async () => {
    const { room, rooms } = createRoomFixture()
    const session = new FakeSession()
    const doc = new Y.Doc()
    doc.getMap(DocKeys.META).set(DocKeys.META_LANGUAGE, 'rust')
    doc.getMap(DocKeys.META).set(DocKeys.META_TITLE, '  Interview prep  ')
    room.applyRemoteUpdate(Y.encodeStateAsUpdate(doc), session.asSession())
    await room.flush()
    expect(rooms.touches.at(-1)).toEqual({ language: 'rust', title: 'Interview prep' })

    doc.getMap(DocKeys.META).set(DocKeys.META_LANGUAGE, 'klingon')
    room.applyRemoteUpdate(Y.encodeStateAsUpdate(doc), session.asSession())
    await room.flush()
    expect(rooms.touches.at(-1)).toEqual({ title: 'Interview prep' })
  })

  it('flushes on dispose and refuses new sessions afterwards', async () => {
    const { room, updates } = createRoomFixture({ flushIntervalMs: 60_000 })
    const session = new FakeSession()
    room.applyRemoteUpdate(clientEdit('unsaved').update, session.asSession())

    await room.dispose()
    expect(updates.all).toHaveLength(1)
    expect(room.attach(new FakeSession().asSession())).toBe(false)
    await room.dispose() // idempotent
  })

  it('reports occupancy changes', () => {
    const { room } = createRoomFixture()
    const counts: number[] = []
    room.onOccupancyChange((r) => counts.push(r.sessionCount))
    const session = new FakeSession()
    room.attach(session.asSession())
    room.detach(session.asSession())
    room.detach(session.asSession()) // second detach is a no-op
    expect(counts).toEqual([1, 0])
  })
})

describe('Room ↔ Room over the bus', () => {
  it('converges two nodes and never echoes', async () => {
    const hub = new FakeHub()
    const busA = hub.connect('00000000-0000-4000-8000-00000000000a')
    const busB = hub.connect('00000000-0000-4000-8000-00000000000b')
    const a = createRoomFixture({ bus: busA })
    const b = createRoomFixture({ bus: busB })
    await busA.subscribe(a.room.slug, (env) => a.room.handleBusMessage(env, UpdateOrigin.REDIS))
    await busB.subscribe(b.room.slug, (env) => b.room.handleBusMessage(env, UpdateOrigin.REDIS))

    const onA = new FakeSession()
    const onB = new FakeSession()
    a.room.attach(onA.asSession())
    b.room.attach(onB.asSession())

    a.room.applyRemoteUpdate(clientEdit('typed on A').update, onA.asSession())

    expect(b.room.doc.getText(DocKeys.CONTENT).toString()).toBe('typed on A')
    expect(onB.updates).toHaveLength(1)
    expect(busA.published).toHaveLength(1)
    expect(busB.published).toHaveLength(0) // B did not re-publish what it got from Redis

    await Promise.all([a.room.flush(), b.room.flush()])
    expect(a.updates.all).toHaveLength(1) // only the originating node persists
    expect(b.updates.all).toHaveLength(0)
  })

  it('a node that joins late catches up through a sync request', async () => {
    const hub = new FakeHub()
    const busA = hub.connect('00000000-0000-4000-8000-00000000000a')
    const busB = hub.connect('00000000-0000-4000-8000-00000000000b')
    const a = createRoomFixture({ bus: busA })
    await busA.subscribe(a.room.slug, (env) => a.room.handleBusMessage(env, UpdateOrigin.REDIS))
    a.room.applyRemoteUpdate(clientEdit('only in A’s memory').update, new FakeSession().asSession())

    const b = createRoomFixture({ bus: busB })
    await busB.subscribe(b.room.slug, (env) => b.room.handleBusMessage(env, UpdateOrigin.REDIS))
    b.room.requestPeerSync()
    await sleep(0)

    expect(b.room.doc.getText(DocKeys.CONTENT).toString()).toBe('only in A’s memory')
    expect(b.updates.all).toHaveLength(0)
  })
})
