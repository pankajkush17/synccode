import { DocKeys, isLanguageId, TITLE_MAX_LENGTH } from '@synccode/shared'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'
import { ProtocolError } from '../errors'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import type { RoomMetaPatch, RoomRepository } from '../persistence/RoomRepository'
import type { UpdateRepository } from '../persistence/UpdateRepository'
import type { MessageEnvelope } from '../pubsub/MessageEnvelope'
import type { RoomSession } from '../ws/RoomSession'
import type { RoomBroadcaster } from './RoomBroadcaster'
import { isSystemOrigin, type SystemOrigin } from './UpdateOrigin'

interface AwarenessChanges {
  added: number[]
  updated: number[]
  removed: number[]
}

export interface RoomOptions {
  readonly flushIntervalMs: number
}

export interface RoomRecord {
  readonly id: string
  readonly slug: string
  readonly editTokenHash: string
}

export type OccupancyListener = (room: Room) => void

/**
 * One collaborative document, hot in this node's memory.
 *
 * Owns the Y.Doc and the Awareness instance for a slug, applies incoming
 * changes, keeps the dirty-set of updates that still need to reach Postgres,
 * and delegates all fan-out to the RoomBroadcaster.
 */
export class Room {
  private static readonly DISPOSE_FLUSH_RETRIES = 3

  readonly doc = new Y.Doc({ gc: true })
  readonly awareness = new awarenessProtocol.Awareness(this.doc)

  private readonly sessionSet = new Set<RoomSession>()
  private dirtyUpdates: Uint8Array[] = []
  private metaDirty = false
  private flushTimer: NodeJS.Timeout | null = null
  /** Serialises flushes so batches reach Postgres in order. */
  private flushChain: Promise<void> = Promise.resolve()
  private disposed = false
  private occupancyListener: OccupancyListener | null = null

  readonly slug: string
  readonly id: string
  readonly editTokenHash: string

  constructor(
    record: RoomRecord,
    private readonly broadcaster: RoomBroadcaster,
    private readonly updates: UpdateRepository,
    private readonly rooms: RoomRepository,
    private readonly logger: Logger,
    private readonly options: RoomOptions,
    private readonly metrics?: MetricsRegistry,
  ) {
    this.slug = record.slug
    this.id = record.id
    this.editTokenHash = record.editTokenHash

    // The server is not a participant: it must not appear as a peer.
    this.awareness.setLocalState(null)

    this.doc.on('update', (update: Uint8Array, origin: unknown) => this.onDocUpdate(update, origin))
    this.awareness.on('update', (changes: AwarenessChanges, origin: unknown) =>
      this.onAwarenessUpdate(changes, origin),
    )
    this.doc.getMap(DocKeys.META).observe((_event, transaction) => {
      if (!isSystemOrigin(transaction.origin)) this.metaDirty = true
    })
  }

  // ── sessions ────────────────────────────────────────────────────────────

  get sessions(): ReadonlySet<RoomSession> {
    return this.sessionSet
  }

  get sessionCount(): number {
    return this.sessionSet.size
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  /** RoomManager listens here to schedule or cancel idle eviction. */
  onOccupancyChange(listener: OccupancyListener): void {
    this.occupancyListener = listener
  }

  /** Returns false if the room was evicted in the meantime; the caller should ask the client to retry. */
  attach(session: RoomSession): boolean {
    if (this.disposed) return false
    this.sessionSet.add(session)
    this.occupancyListener?.(this)

    session.sendAuthAck()
    const peers = [...this.awareness.getStates().keys()]
    if (peers.length > 0) {
      session.sendAwareness(awarenessProtocol.encodeAwarenessUpdate(this.awareness, peers))
    }
    return true
  }

  detach(session: RoomSession): void {
    if (!this.sessionSet.delete(session)) return
    // Tell everyone — on every node — that this socket's cursors are gone.
    const clients = session.controlledClientIds
    if (clients.length > 0 && !this.disposed) {
      awarenessProtocol.removeAwarenessStates(this.awareness, clients, session)
    }
    this.occupancyListener?.(this)
  }

  closeAllSessions(code: number, reason: string): void {
    for (const session of [...this.sessionSet]) session.close(code, reason)
  }

  // ── sync protocol ───────────────────────────────────────────────────────

  /**
   * Step 1 from a client: reply with the diff it is missing (step 2), then send
   * our own step 1 so a client that may write can push what *we* are missing.
   */
  handleSyncStep1(session: RoomSession, clientStateVector: Uint8Array): void {
    session.sendSyncStep2(this.diffSince(clientStateVector))
    if (session.canWrite) session.sendSyncStep1(this.stateVector())
  }

  applyRemoteUpdate(update: Uint8Array, origin: RoomSession | SystemOrigin): void {
    if (this.disposed) return
    try {
      Y.applyUpdate(this.doc, update, origin)
    } catch (err) {
      throw new ProtocolError('malformed document update', { cause: err })
    }
  }

  applyAwareness(update: Uint8Array, origin: RoomSession | SystemOrigin): void {
    if (this.disposed) return
    try {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, update, origin)
    } catch (err) {
      throw new ProtocolError('malformed awareness update', { cause: err })
    }
  }

  stateVector(): Uint8Array {
    return Y.encodeStateVector(this.doc)
  }

  diffSince(stateVector: Uint8Array): Uint8Array {
    try {
      return Y.encodeStateAsUpdate(this.doc, stateVector)
    } catch (err) {
      throw new ProtocolError('malformed state vector', { cause: err })
    }
  }

  // ── cross-node bus ──────────────────────────────────────────────────────

  handleBusMessage(envelope: MessageEnvelope, redisOrigin: SystemOrigin): void {
    if (this.disposed) return
    try {
      switch (envelope.kind) {
        case 'update':
          this.applyRemoteUpdate(envelope.payload, redisOrigin)
          break
        case 'awareness':
          this.applyAwareness(envelope.payload, redisOrigin)
          break
        case 'sync-request':
          this.broadcaster.answerSyncRequest(this, envelope.payload)
          break
      }
    } catch (err) {
      this.logger.warn('dropping bad bus message', { err, kind: envelope.kind })
    }
  }

  requestPeerSync(): void {
    if (!this.disposed) this.broadcaster.publishSyncRequest(this)
  }

  // ── persistence ─────────────────────────────────────────────────────────

  get hasUnflushedChanges(): boolean {
    return this.dirtyUpdates.length > 0 || this.metaDirty
  }

  /** Writes every dirty update in one batched INSERT. Resolves once it is durable. */
  flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flushChain = this.flushChain.then(() => this.flushNow())
    return this.flushChain
  }

  /** Final flush, then release everything. Idempotent. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.flush()
    // A failed final flush would lose edits; give Postgres a few more chances.
    for (
      let attempt = 0;
      attempt < Room.DISPOSE_FLUSH_RETRIES && this.hasUnflushedChanges;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
      await this.flush()
    }
    if (this.hasUnflushedChanges) {
      this.logger.error('room disposed with unflushed updates', {
        updates: this.dirtyUpdates.length,
      })
    }
    this.awareness.destroy()
    this.doc.destroy()
  }

  private async flushNow(): Promise<void> {
    if (!this.hasUnflushedChanges) return

    const batch = this.dirtyUpdates
    const metaPatch = this.metaDirty ? this.readMeta() : {}
    this.dirtyUpdates = []
    this.metaDirty = false

    const stopTimer = this.metrics?.flushDuration.startTimer()
    try {
      await this.updates.appendBatch(this.id, batch)
      await this.rooms.touch(this.id, metaPatch)
      this.metrics?.updatesPersisted.inc(batch.length)
    } catch (err) {
      // Keep the batch (in order, ahead of anything newer) and try again shortly.
      this.dirtyUpdates = [...batch, ...this.dirtyUpdates]
      this.metaDirty ||= Object.keys(metaPatch).length > 0
      this.logger.error('flush failed; will retry', { err, updates: batch.length })
      if (!this.disposed) this.scheduleFlush()
    } finally {
      stopTimer?.()
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.disposed) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, this.options.flushIntervalMs)
  }

  /** Mirrors the synced `meta` map into the `rooms` row, ignoring anything invalid. */
  private readMeta(): RoomMetaPatch {
    const meta = this.doc.getMap(DocKeys.META)
    const patch: RoomMetaPatch = {}
    const language = meta.get(DocKeys.META_LANGUAGE)
    if (isLanguageId(language)) patch.language = language
    const title = meta.get(DocKeys.META_TITLE)
    if (typeof title === 'string') patch.title = title.trim().slice(0, TITLE_MAX_LENGTH) || null
    return patch
  }

  // ── observers ───────────────────────────────────────────────────────────

  private onDocUpdate(update: Uint8Array, origin: unknown): void {
    // Each node persists only what its own clients produced: every update is
    // seen by every node but originates on exactly one, so it is written once.
    if (!isSystemOrigin(origin)) {
      this.dirtyUpdates.push(update)
      this.scheduleFlush()
    }
    this.broadcaster.onDocUpdate(this, update, origin)
  }

  private onAwarenessUpdate(changes: AwarenessChanges, origin: unknown): void {
    if (Room.isSession(origin)) origin.trackAwareness(changes.added, changes.removed)
    this.broadcaster.onAwarenessUpdate(
      this,
      [...changes.added, ...changes.updated, ...changes.removed],
      origin,
    )
  }

  private static isSession(origin: unknown): origin is RoomSession {
    return (
      typeof origin === 'object' &&
      origin !== null &&
      typeof (origin as RoomSession).trackAwareness === 'function'
    )
  }
}
