import { TokenService } from './auth/TokenService'
import type { Config } from './config/Config'
import { HttpServer } from './http/HttpServer'
import { HealthRoutes } from './http/routes/HealthRoutes'
import { MetricsRoutes } from './http/routes/MetricsRoutes'
import { RoomsRoutes } from './http/routes/RoomsRoutes'
import { NodeIdentity } from './identity/NodeIdentity'
import { GracefulShutdown } from './lifecycle/GracefulShutdown'
import { Logger } from './logging/Logger'
import { MetricsRegistry } from './metrics/MetricsRegistry'
import { CompactionJob } from './persistence/CompactionJob'
import { Database } from './persistence/Database'
import { RoomRepository } from './persistence/RoomRepository'
import { SnapshotRepository } from './persistence/SnapshotRepository'
import { UpdateRepository } from './persistence/UpdateRepository'
import { RedisPubSub } from './pubsub/RedisPubSub'
import { RoomBroadcaster } from './rooms/RoomBroadcaster'
import { RoomHydrator } from './rooms/RoomHydrator'
import { RoomManager } from './rooms/RoomManager'
import { SlugGenerator } from './rooms/SlugGenerator'
import { HeartbeatManager } from './ws/HeartbeatManager'
import { MessageCodec } from './ws/MessageCodec'
import { WebSocketGateway } from './ws/WebSocketGateway'

/**
 * Composition root: builds every class once and wires them together by
 * constructor injection. One instance is one sync node — the multi-node tests
 * simply create two of these in the same process.
 */
export class SyncServer {
  readonly identity: NodeIdentity
  readonly logger: Logger
  readonly metrics: MetricsRegistry
  readonly database: Database
  readonly pubsub: RedisPubSub
  readonly roomManager: RoomManager
  readonly compaction: CompactionJob
  readonly http: HttpServer
  readonly shutdown: GracefulShutdown

  private readonly heartbeat: HeartbeatManager

  constructor(private readonly config: Config) {
    this.identity = new NodeIdentity(undefined, config.nodeName)
    this.logger = Logger.create({ level: config.logLevel, base: { node: this.identity.name } })
    this.metrics = new MetricsRegistry()

    // Persistence
    this.database = new Database(config.databaseUrl)
    const roomRepository = new RoomRepository(this.database)
    const updateRepository = new UpdateRepository(this.database)
    const snapshotRepository = new SnapshotRepository(this.database)
    const hydrator = new RoomHydrator(snapshotRepository, updateRepository)

    // Cross-node bus
    this.pubsub = new RedisPubSub(
      config.redisUrl,
      this.identity,
      this.logger.child({ component: 'pubsub' }),
      this.metrics,
    )

    // Rooms
    const broadcaster = new RoomBroadcaster(
      this.pubsub,
      this.logger.child({ component: 'broadcaster' }),
    )
    this.roomManager = new RoomManager(
      roomRepository,
      hydrator,
      broadcaster,
      updateRepository,
      this.pubsub,
      this.logger.child({ component: 'rooms' }),
      { flushIntervalMs: config.flushIntervalMs, idleEvictionMs: config.idleEvictionMs },
      this.metrics,
    )
    this.pubsub.onReconnect(() => this.roomManager.resyncAll())

    this.compaction = new CompactionJob(
      this.database,
      snapshotRepository,
      updateRepository,
      hydrator,
      () => this.roomManager.hotRooms(),
      { intervalMs: config.compactionIntervalMs, threshold: config.compactionThreshold },
      this.logger.child({ component: 'compaction' }),
      this.metrics,
    )

    // Transport
    const tokens = new TokenService(config.editSecret)
    this.heartbeat = new HeartbeatManager(
      config.heartbeatIntervalMs,
      this.logger.child({ component: 'heartbeat' }),
    )
    const gateway = new WebSocketGateway(
      this.roomManager,
      tokens,
      new MessageCodec(),
      this.heartbeat,
      this.identity,
      {
        allowedOrigins: config.allowedOrigins,
        maxPayloadBytes: config.maxPayloadBytes,
        maxBufferedBytes: config.maxBufferedBytes,
      },
      this.logger.child({ component: 'gateway' }),
      this.metrics,
    )

    this.http = new HttpServer(
      { port: config.httpPort, allowedOrigins: config.allowedOrigins },
      [
        new HealthRoutes(
          this.identity,
          [
            { name: 'postgres', check: () => this.database.ping() },
            { name: 'redis', check: () => this.pubsub.ping() },
          ],
          () => this.http.isDraining,
        ),
        new MetricsRoutes(this.metrics),
        new RoomsRoutes(roomRepository, tokens, new SlugGenerator()),
      ],
      gateway,
      this.logger.child({ component: 'http' }),
    )

    this.shutdown = new GracefulShutdown(this.http, this.roomManager, this.logger, {
      graceMs: config.shutdownGraceMs,
      before: [
        { name: 'compaction', run: () => this.compaction.stop() },
        { name: 'heartbeat', run: () => this.heartbeat.stop() },
      ],
      after: [
        { name: 'pubsub', run: () => this.pubsub.quit() },
        { name: 'database', run: () => this.database.close() },
      ],
    })
  }

  get port(): number {
    return this.http.port
  }

  /** Connects dependencies, then starts listening. Resolves with the bound port. */
  async start(): Promise<number> {
    if (this.config.runMigrations) {
      await this.database.migrate()
      this.logger.info('migrations applied')
    }
    if (!(await this.database.ping())) throw new Error('cannot reach Postgres')
    await this.pubsub.connect()

    const port = await this.http.listen()
    this.heartbeat.start()
    this.compaction.start()
    this.logger.info('sync node ready', { port, nodeId: this.identity.id })
    return port
  }

  /** Graceful teardown; safe to call more than once. */
  stop(): Promise<void> {
    return this.shutdown.run()
  }
}
