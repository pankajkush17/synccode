import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client'

/**
 * Every metric the service exports, on a private registry so several server
 * instances can live in one process (the multi-node tests rely on that).
 */
export class MetricsRegistry {
  readonly registry = new Registry()

  readonly connections = new Gauge({
    name: 'synccode_ws_connections',
    help: 'Currently open WebSocket connections on this node',
    registers: [this.registry],
  })

  readonly hotRooms = new Gauge({
    name: 'synccode_hot_rooms',
    help: 'Rooms currently held in memory on this node',
    registers: [this.registry],
  })

  readonly messagesReceived = new Counter({
    name: 'synccode_ws_messages_received_total',
    help: 'Frames received from clients, by message type',
    labelNames: ['type'] as const,
    registers: [this.registry],
  })

  readonly messagesSent = new Counter({
    name: 'synccode_ws_messages_sent_total',
    help: 'Frames sent to clients, by message type',
    labelNames: ['type'] as const,
    registers: [this.registry],
  })

  readonly broadcastLatency = new Histogram({
    name: 'synccode_broadcast_latency_seconds',
    help: 'Time from receiving a client frame to finishing its fan-out (local sockets + Redis publish)',
    buckets: [0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
    registers: [this.registry],
  })

  readonly pubsubPublished = new Counter({
    name: 'synccode_pubsub_published_total',
    help: 'Messages published to Redis, by kind',
    labelNames: ['kind'] as const,
    registers: [this.registry],
  })

  readonly pubsubReceived = new Counter({
    name: 'synccode_pubsub_received_total',
    help: 'Messages received from Redis, by kind and whether they were our own echo',
    labelNames: ['kind', 'echo'] as const,
    registers: [this.registry],
  })

  readonly updatesPersisted = new Counter({
    name: 'synccode_updates_persisted_total',
    help: 'Document updates written to Postgres',
    registers: [this.registry],
  })

  readonly flushDuration = new Histogram({
    name: 'synccode_flush_duration_seconds',
    help: 'Duration of a batched update flush to Postgres',
    buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [this.registry],
  })

  readonly hydrationDuration = new Histogram({
    name: 'synccode_room_hydration_seconds',
    help: 'Cold-start time: loading a room from Postgres into memory',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  })

  readonly compactions = new Counter({
    name: 'synccode_compactions_total',
    help: 'Snapshots written by the compaction job',
    registers: [this.registry],
  })

  readonly backpressureDrops = new Counter({
    name: 'synccode_backpressure_disconnects_total',
    help: 'Sockets disconnected because their send buffer grew past the limit',
    registers: [this.registry],
  })

  constructor(options: { collectDefaults?: boolean } = {}) {
    if (options.collectDefaults ?? true) collectDefaultMetrics({ register: this.registry })
  }

  get contentType(): string {
    return this.registry.contentType
  }

  render(): Promise<string> {
    return this.registry.metrics()
  }
}
