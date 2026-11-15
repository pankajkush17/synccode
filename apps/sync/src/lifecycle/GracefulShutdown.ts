import { CloseCode } from '@synccode/shared'
import type { HttpServer } from '../http/HttpServer'
import type { Logger } from '../logging/Logger'
import type { RoomManager } from '../rooms/RoomManager'

/** A resource released during shutdown, in the order given. */
export interface ShutdownStep {
  readonly name: string
  run(): Promise<void> | void
}

export interface GracefulShutdownOptions {
  /** Hard deadline; must stay under the orchestrator's SIGKILL grace period (30s on k8s). */
  readonly graceMs: number
  /** Stopped before rooms are flushed (timers, background jobs). */
  readonly before?: readonly ShutdownStep[]
  /** Released after the last flush (Redis, Postgres). */
  readonly after?: readonly ShutdownStep[]
}

/**
 * Ordered teardown on SIGTERM / SIGINT so a deploy never loses an edit:
 *
 *   1. stop accepting  — readiness fails, new sockets are refused
 *   2. background jobs — compaction and heartbeat timers stop
 *   3. rooms           — sockets closed (clients reconnect elsewhere), every dirty doc flushed
 *   4. dependencies    — Redis subscriptions dropped, then the Postgres pool
 *   5. http            — port released
 */
export class GracefulShutdown {
  private shuttingDown: Promise<void> | null = null

  constructor(
    private readonly http: HttpServer,
    private readonly rooms: RoomManager,
    private readonly logger: Logger,
    private readonly options: GracefulShutdownOptions,
  ) {}

  /** Wires process signals. Exits 0 on a clean teardown, 1 if the deadline passes. */
  install(): void {
    const onSignal = (signal: string) => {
      this.logger.info('signal received', { signal })
      const deadline = setTimeout(() => {
        this.logger.error('shutdown deadline exceeded; forcing exit')
        process.exit(1)
      }, this.options.graceMs)
      deadline.unref()
      void this.run().then(
        () => process.exit(0),
        () => process.exit(1),
      )
    }
    process.once('SIGTERM', () => onSignal('SIGTERM'))
    process.once('SIGINT', () => onSignal('SIGINT'))
  }

  /** Runs the teardown once; later calls return the same promise. */
  run(): Promise<void> {
    this.shuttingDown ??= this.teardown()
    return this.shuttingDown
  }

  private async teardown(): Promise<void> {
    this.logger.info('shutdown: begin')
    this.http.stopAcceptingNew()

    for (const step of this.options.before ?? []) await this.attempt(step)

    await this.attempt({
      name: 'rooms',
      run: async () => {
        for (const room of this.rooms.hotRooms()) {
          room.closeAllSessions(CloseCode.GOING_AWAY, 'server shutting down')
        }
        await this.rooms.disposeAll() // flushes every dirty doc
      },
    })

    for (const step of this.options.after ?? []) await this.attempt(step)
    await this.attempt({ name: 'http', run: () => this.http.close() })
    this.logger.info('shutdown: complete')
  }

  /** One failing step must not stop the rest of the teardown. */
  private async attempt(step: ShutdownStep): Promise<void> {
    try {
      await step.run()
    } catch (err) {
      this.logger.error('shutdown step failed', { err, step: step.name })
    }
  }
}
