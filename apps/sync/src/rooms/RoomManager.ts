import { NotFoundError } from '../errors'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import type { RoomRepository } from '../persistence/RoomRepository'
import type { UpdateRepository } from '../persistence/UpdateRepository'
import type { RoomBus } from '../pubsub/RoomBus'
import { Room } from './Room'
import type { RoomBroadcaster } from './RoomBroadcaster'
import type { RoomHydrator } from './RoomHydrator'
import { UpdateOrigin } from './UpdateOrigin'

export interface RoomManagerOptions {
  readonly flushIntervalMs: number
  readonly idleEvictionMs: number
}

/**
 * The set of rooms hot on this node: `Map<slug, Room>`.
 *
 * Rooms load lazily on first connection (subscribe to Redis → hydrate from
 * Postgres → ask peers for anything newer) and are evicted after sitting empty
 * for `idleEvictionMs`. Nothing here is precious: any node can drop a room and
 * any node can rebuild it, which is what makes the nodes interchangeable.
 */
export class RoomManager {
  private readonly map = new Map<string, Room>()
  private readonly inflight = new Map<string, Promise<Room>>()
  private readonly evicting = new Map<string, Promise<void>>()
  private readonly evictionTimers = new Map<string, NodeJS.Timeout>()
  private closed = false

  constructor(
    private readonly rooms: RoomRepository,
    private readonly hydrator: RoomHydrator,
    private readonly broadcaster: RoomBroadcaster,
    private readonly updates: UpdateRepository,
    private readonly bus: RoomBus,
    private readonly logger: Logger,
    private readonly options: RoomManagerOptions,
    private readonly metrics?: MetricsRegistry,
  ) {}

  get size(): number {
    return this.map.size
  }

  /** Rooms currently in memory — the compaction job's work list. */
  hotRooms(): Room[] {
    return [...this.map.values()]
  }

  peek(slug: string): Room | undefined {
    return this.map.get(slug)
  }

  async get(slug: string): Promise<Room> {
    if (this.closed) throw new Error('RoomManager is shut down')

    // A room mid-eviction is still flushing; wait so the reload sees its writes.
    const leaving = this.evicting.get(slug)
    if (leaving) await leaving

    const cached = this.map.get(slug)
    if (cached) return cached

    const pending = this.inflight.get(slug)
    if (pending) return pending

    // Concurrent first connections share one load instead of racing.
    const p = this.load(slug).finally(() => this.inflight.delete(slug))
    this.inflight.set(slug, p)
    return p
  }

  private async load(slug: string): Promise<Room> {
    const row = await this.rooms.findBySlug(slug)
    if (!row) throw new NotFoundError(`room ${slug}`)

    const logger = this.logger.child({ roomSlug: slug })
    const room = new Room(
      row,
      this.broadcaster,
      this.updates,
      this.rooms,
      logger,
      { flushIntervalMs: this.options.flushIntervalMs },
      this.metrics,
    )
    const stopTimer = this.metrics?.hydrationDuration.startTimer()

    try {
      // Subscribe before hydrating: an update published while we read Postgres
      // is then applied on top instead of being missed.
      await this.bus.subscribe(slug, (envelope) =>
        room.handleBusMessage(envelope, UpdateOrigin.REDIS),
      )
      const result = await this.hydrator.hydrate(row.id, room.doc)
      logger.info('room loaded', { ...result })
    } catch (err) {
      await this.bus.unsubscribe(slug).catch(() => {})
      await room.dispose().catch(() => {})
      throw err
    } finally {
      stopTimer?.()
    }

    if (this.closed) {
      await this.bus.unsubscribe(slug).catch(() => {})
      await room.dispose()
      throw new Error('RoomManager is shut down')
    }

    this.map.set(slug, room)
    this.metrics?.hotRooms.set(this.map.size)
    room.onOccupancyChange((r) => this.onOccupancyChange(r))
    // Another node may hold edits younger than its last flush; ask for them.
    room.requestPeerSync()
    // If nobody ends up attaching (e.g. the upgrade fails) the room still leaves.
    this.scheduleEviction(slug)
    return room
  }

  /** After a Redis reconnect, messages may have been missed: re-sync every room. */
  resyncAll(): void {
    for (const room of this.map.values()) room.requestPeerSync()
  }

  async evictIfIdle(slug: string): Promise<void> {
    this.clearEvictionTimer(slug)
    const room = this.map.get(slug)
    if (!room || room.sessionCount > 0) return
    await this.evict(room)
  }

  /** Shutdown path: close every socket, flush every dirty document, drop everything. */
  async disposeAll(): Promise<void> {
    this.closed = true
    for (const slug of [...this.evictionTimers.keys()]) this.clearEvictionTimer(slug)
    await Promise.allSettled(this.inflight.values())
    await Promise.allSettled([
      ...this.evicting.values(),
      ...[...this.map.values()].map((room) => this.evict(room)),
    ])
  }

  private evict(room: Room): Promise<void> {
    const { slug } = room
    this.map.delete(slug)
    this.metrics?.hotRooms.set(this.map.size)

    const done = (async () => {
      try {
        await room.dispose()
        await this.bus.unsubscribe(slug)
        this.logger.info('room evicted', { roomSlug: slug })
      } catch (err) {
        this.logger.error('room eviction failed', { err, roomSlug: slug })
      }
    })().finally(() => this.evicting.delete(slug))

    this.evicting.set(slug, done)
    return done
  }

  private onOccupancyChange(room: Room): void {
    if (this.closed) return
    if (room.sessionCount === 0) this.scheduleEviction(room.slug)
    else this.clearEvictionTimer(room.slug)
  }

  private scheduleEviction(slug: string): void {
    this.clearEvictionTimer(slug)
    const timer = setTimeout(() => void this.evictIfIdle(slug), this.options.idleEvictionMs)
    timer.unref()
    this.evictionTimers.set(slug, timer)
  }

  private clearEvictionTimer(slug: string): void {
    const timer = this.evictionTimers.get(slug)
    if (timer) clearTimeout(timer)
    this.evictionTimers.delete(slug)
  }
}
