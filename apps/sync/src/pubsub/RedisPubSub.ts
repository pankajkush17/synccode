import { Redis } from 'ioredis'
import type { NodeIdentity } from '../identity/NodeIdentity'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import { type EnvelopeKind, MessageEnvelope } from './MessageEnvelope'
import type { EnvelopeHandler, RoomBus } from './RoomBus'
import { RoomChannels } from './RoomChannels'

/**
 * Turns N sync nodes into one logical broker.
 *
 * Redis requires a dedicated connection for SUBSCRIBE (a subscribed connection
 * cannot issue other commands), so this class owns two: `pub` and `sub`.
 * Every outgoing message is wrapped in a MessageEnvelope stamped with this
 * node's id; incoming messages carrying our own id are dropped (echo suppression).
 */
export class RedisPubSub implements RoomBus {
  private readonly pub: Redis
  private readonly sub: Redis
  private readonly handlers = new Map<string, EnvelopeHandler>()
  private readonly reconnectListeners = new Set<() => void>()
  private hasConnectedOnce = false
  private closed = false

  constructor(
    url: string,
    private readonly identity: NodeIdentity,
    private readonly logger: Logger,
    private readonly metrics: MetricsRegistry,
  ) {
    const options = {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
    }
    this.pub = new Redis(url, { ...options, connectionName: `sync-pub-${identity.name}` })
    this.sub = new Redis(url, {
      ...options,
      connectionName: `sync-sub-${identity.name}`,
      // ioredis re-issues SUBSCRIBE for every channel after a reconnect.
      autoResubscribe: true,
    })

    this.pub.on('error', (err) => this.logger.error('redis pub error', { err }))
    this.sub.on('error', (err) => this.logger.error('redis sub error', { err }))
    this.sub.on('messageBuffer', (channel, message) => this.onMessage(channel, message))
    this.sub.on('ready', () => this.onSubscriberReady())
  }

  async connect(): Promise<void> {
    await Promise.all([this.pub.connect(), this.sub.connect()])
    this.logger.info('redis connected')
  }

  /**
   * Fired after the subscriber connection is re-established. Pub/sub has no
   * history, so anything published while we were away is gone — listeners use
   * this to ask peers for a catch-up diff.
   */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.add(listener)
    return () => this.reconnectListeners.delete(listener)
  }

  async subscribe(slug: string, handler: EnvelopeHandler): Promise<void> {
    this.handlers.set(slug, handler)
    try {
      await this.sub.subscribe(...RoomChannels.all(slug))
    } catch (err) {
      this.handlers.delete(slug)
      throw err
    }
  }

  async unsubscribe(slug: string): Promise<void> {
    this.handlers.delete(slug)
    if (this.closed) return
    await this.sub.unsubscribe(...RoomChannels.all(slug))
  }

  /** Fire-and-forget by design: durability lives in Postgres, not on the bus. */
  publish(slug: string, kind: EnvelopeKind, payload: Uint8Array): void {
    if (this.closed) return
    const message = MessageEnvelope.encode(new MessageEnvelope(this.identity.id, kind, payload))
    this.metrics.pubsubPublished.inc({ kind })
    this.pub.publish(RoomChannels.forKind(slug, kind), message).catch((err: unknown) => {
      this.logger.warn('redis publish failed', { err, slug, kind })
    })
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.pub.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async quit(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.handlers.clear()
    this.reconnectListeners.clear()
    await Promise.allSettled([this.sub.quit(), this.pub.quit()])
  }

  private onMessage(channel: Buffer, message: Buffer): void {
    const parsed = RoomChannels.parse(channel.toString('utf8'))
    if (!parsed) return

    let envelope: MessageEnvelope
    try {
      envelope = MessageEnvelope.decode(message)
    } catch (err) {
      this.logger.warn('dropping malformed envelope', { err, slug: parsed.slug })
      return
    }

    const echo = envelope.nodeId === this.identity.id
    this.metrics.pubsubReceived.inc({ kind: envelope.kind, echo: String(echo) })
    if (echo) return

    const handler = this.handlers.get(parsed.slug)
    if (!handler) return
    try {
      handler(envelope)
    } catch (err) {
      this.logger.error('envelope handler failed', { err, slug: parsed.slug, kind: envelope.kind })
    }
  }

  private onSubscriberReady(): void {
    if (!this.hasConnectedOnce) {
      this.hasConnectedOnce = true
      return
    }
    this.logger.warn('redis subscriber reconnected; requesting catch-up')
    for (const listener of this.reconnectListeners) listener()
  }
}
