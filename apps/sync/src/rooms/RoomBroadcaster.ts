import * as awarenessProtocol from 'y-protocols/awareness'
import type { Logger } from '../logging/Logger'
import type { RoomBus } from '../pubsub/RoomBus'
import type { Room } from './Room'
import { isSystemOrigin, UpdateOrigin } from './UpdateOrigin'

/**
 * Fan-out. Given a change in a room, deliver it to the sockets on this node and
 * — if the change originated here — publish it so every other node does the same.
 */
export class RoomBroadcaster {
  constructor(
    private readonly bus: RoomBus,
    private readonly logger: Logger,
  ) {}

  onDocUpdate(room: Room, update: Uint8Array, origin: unknown): void {
    if (origin === UpdateOrigin.HYDRATE) return

    for (const session of room.sessions) {
      if (session !== origin) session.sendUpdate(update)
    }
    // Re-publishing something that arrived from Redis would loop forever.
    if (!isSystemOrigin(origin)) this.bus.publish(room.slug, 'update', update)
  }

  onAwarenessUpdate(room: Room, changedClients: readonly number[], origin: unknown): void {
    if (changedClients.length === 0) return
    const payload = awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...changedClients])

    for (const session of room.sessions) {
      if (session !== origin) session.sendAwareness(payload)
    }
    if (!isSystemOrigin(origin)) this.bus.publish(room.slug, 'awareness', payload)
  }

  /** Ask nodes already serving this room for whatever we are missing. */
  publishSyncRequest(room: Room): void {
    this.logger.debug('publishing sync request', { roomSlug: room.slug })
    this.bus.publish(room.slug, 'sync-request', room.stateVector())
  }

  /** Answer a peer's sync request with the document diff and our presence states. */
  answerSyncRequest(room: Room, peerStateVector: Uint8Array): void {
    const diff = room.diffSince(peerStateVector)
    if (!RoomBroadcaster.isEmptyUpdate(diff)) this.bus.publish(room.slug, 'update', diff)

    const clients = [...room.awareness.getStates().keys()]
    if (clients.length > 0) {
      this.bus.publish(
        room.slug,
        'awareness',
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, clients),
      )
    }
  }

  /** `Y.encodeStateAsUpdate` yields exactly two zero bytes when there is nothing to send. */
  static isEmptyUpdate(update: Uint8Array): boolean {
    return update.byteLength <= 2
  }
}
