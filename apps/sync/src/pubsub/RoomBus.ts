import type { EnvelopeKind, MessageEnvelope } from './MessageEnvelope'

export type EnvelopeHandler = (envelope: MessageEnvelope) => void

/**
 * The cross-node bus as rooms see it. RedisPubSub is the production
 * implementation; tests substitute an in-memory fake.
 */
export interface RoomBus {
  subscribe(slug: string, handler: EnvelopeHandler): Promise<void>
  unsubscribe(slug: string): Promise<void>
  publish(slug: string, kind: EnvelopeKind, payload: Uint8Array): void
}
