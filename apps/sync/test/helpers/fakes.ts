import { Logger } from '../../src/logging/Logger'
import type { RoomMetaPatch, RoomRepository } from '../../src/persistence/RoomRepository'
import type { UpdateRepository } from '../../src/persistence/UpdateRepository'
import { type EnvelopeKind, MessageEnvelope } from '../../src/pubsub/MessageEnvelope'
import type { EnvelopeHandler, RoomBus } from '../../src/pubsub/RoomBus'
import { Room } from '../../src/rooms/Room'
import { RoomBroadcaster } from '../../src/rooms/RoomBroadcaster'
import type { RoomSession } from '../../src/ws/RoomSession'

/**
 * An in-memory stand-in for Redis. Every FakeBus created from the same hub
 * behaves like one node's connection: publishes reach every *other* node.
 */
export class FakeHub {
  private readonly buses = new Set<FakeBus>()

  connect(nodeId: string): FakeBus {
    const bus = new FakeBus(nodeId, this)
    this.buses.add(bus)
    return bus
  }

  deliver(from: FakeBus, slug: string, envelope: MessageEnvelope): void {
    for (const bus of this.buses) {
      // Round-trip through the wire format so encoding bugs cannot hide.
      if (bus !== from) bus.receive(slug, MessageEnvelope.decode(MessageEnvelope.encode(envelope)))
    }
  }
}

export class FakeBus implements RoomBus {
  readonly published: Array<{ slug: string; kind: EnvelopeKind; payload: Uint8Array }> = []
  private readonly handlers = new Map<string, EnvelopeHandler>()

  constructor(
    private readonly nodeId: string,
    private readonly hub?: FakeHub,
  ) {}

  async subscribe(slug: string, handler: EnvelopeHandler): Promise<void> {
    this.handlers.set(slug, handler)
  }

  async unsubscribe(slug: string): Promise<void> {
    this.handlers.delete(slug)
  }

  publish(slug: string, kind: EnvelopeKind, payload: Uint8Array): void {
    this.published.push({ slug, kind, payload })
    this.hub?.deliver(this, slug, new MessageEnvelope(this.nodeId, kind, payload))
  }

  receive(slug: string, envelope: MessageEnvelope): void {
    this.handlers.get(slug)?.(envelope)
  }

  isSubscribed(slug: string): boolean {
    return this.handlers.has(slug)
  }
}

export class FakeUpdateRepository {
  readonly batches: Uint8Array[][] = []
  failNext = 0

  async appendBatch(_roomId: string, updates: readonly Uint8Array[]): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('simulated database outage')
    }
    if (updates.length > 0) this.batches.push([...updates])
  }

  get all(): Uint8Array[] {
    return this.batches.flat()
  }

  asRepository(): UpdateRepository {
    return this as unknown as UpdateRepository
  }
}

export class FakeRoomRepository {
  readonly touches: RoomMetaPatch[] = []

  async touch(_id: string, patch: RoomMetaPatch = {}): Promise<void> {
    this.touches.push(patch)
  }

  asRepository(): RoomRepository {
    return this as unknown as RoomRepository
  }
}

/** Records what a Room sends to a socket, without any socket. */
export class FakeSession {
  readonly updates: Uint8Array[] = []
  readonly awareness: Uint8Array[] = []
  readonly syncStep1: Uint8Array[] = []
  readonly syncStep2: Uint8Array[] = []
  readonly closes: Array<{ code: number; reason: string }> = []
  authAcks = 0
  private readonly clients = new Set<number>()

  constructor(readonly canWrite = true) {}

  get controlledClientIds(): number[] {
    return [...this.clients]
  }
  trackAwareness(added: readonly number[], removed: readonly number[]): void {
    for (const id of added) this.clients.add(id)
    for (const id of removed) this.clients.delete(id)
  }
  sendUpdate(payload: Uint8Array): void {
    this.updates.push(payload)
  }
  sendAwareness(payload: Uint8Array): void {
    this.awareness.push(payload)
  }
  sendSyncStep1(sv: Uint8Array): void {
    this.syncStep1.push(sv)
  }
  sendSyncStep2(diff: Uint8Array): void {
    this.syncStep2.push(diff)
  }
  sendAuthAck(): void {
    this.authAcks++
  }
  close(code: number, reason: string): void {
    this.closes.push({ code, reason })
  }

  asSession(): RoomSession {
    return this as unknown as RoomSession
  }
}

export interface RoomFixture {
  readonly room: Room
  readonly bus: FakeBus
  readonly updates: FakeUpdateRepository
  readonly rooms: FakeRoomRepository
}

export function createRoomFixture(
  options: { slug?: string; bus?: FakeBus; flushIntervalMs?: number } = {},
): RoomFixture {
  const bus = options.bus ?? new FakeBus('00000000-0000-4000-8000-000000000001')
  const updates = new FakeUpdateRepository()
  const rooms = new FakeRoomRepository()
  const logger = Logger.silent()
  const broadcaster = new RoomBroadcaster(bus, logger)
  const room = new Room(
    { id: 'room-id', slug: options.slug ?? 'abcdefghij', editTokenHash: 'hash' },
    broadcaster,
    updates.asRepository(),
    rooms.asRepository(),
    logger,
    { flushIntervalMs: options.flushIntervalMs ?? 20 },
  )
  return { room, bus, updates, rooms }
}
