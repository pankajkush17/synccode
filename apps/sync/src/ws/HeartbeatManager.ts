import type { Logger } from '../logging/Logger'

/** The slice of a `ws` socket the heartbeat needs. */
export interface PingableSocket {
  ping(): void
  terminate(): void
  on(event: 'pong', listener: () => void): unknown
}

/**
 * Protocol-level ping/pong. Each tick, sockets that never answered the previous
 * ping are terminated — a TCP peer that vanished (laptop lid, dead NAT entry)
 * does not send FIN, so without this its session would linger forever.
 */
export class HeartbeatManager {
  private readonly alive = new Map<PingableSocket, boolean>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.alive.clear()
  }

  track(socket: PingableSocket): void {
    this.alive.set(socket, true)
    socket.on('pong', () => {
      if (this.alive.has(socket)) this.alive.set(socket, true)
    })
  }

  untrack(socket: PingableSocket): void {
    this.alive.delete(socket)
  }

  get trackedCount(): number {
    return this.alive.size
  }

  /** Exposed for tests; normally driven by the interval. */
  tick(): void {
    for (const [socket, isAlive] of this.alive) {
      if (!isAlive) {
        this.logger.debug('terminating unresponsive socket')
        this.alive.delete(socket)
        socket.terminate()
        continue
      }
      this.alive.set(socket, false)
      try {
        socket.ping()
      } catch {
        // Socket already closing; the close handler will untrack it.
      }
    }
  }
}
