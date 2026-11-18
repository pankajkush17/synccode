import type { Logger } from '../logging/Logger'

export interface KeepAliveOptions {
  /** Public URL to request; `null` disables the pinger. */
  readonly url: string | null
  readonly intervalMs: number
  readonly timeoutMs?: number
}

/**
 * Free hosts (Render) put a service to sleep after ~15 minutes without inbound
 * traffic. Requesting our own *public* URL goes out through the host's edge and
 * back in, which counts as traffic and keeps the instance awake.
 */
export class KeepAlive {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly options: KeepAliveOptions,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.options.url !== null
  }

  start(): void {
    if (this.timer || !this.enabled) return
    this.timer = setInterval(() => void this.ping(), this.options.intervalMs)
    this.timer.unref()
    this.logger.info('keep-alive enabled', {
      url: this.options.url,
      intervalMs: this.options.intervalMs,
    })
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Exposed for tests; normally driven by the interval. Never throws. */
  async ping(): Promise<boolean> {
    const url = this.options.url
    if (url === null) return false
    try {
      const res = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      })
      if (!res.ok) this.logger.warn('keep-alive ping not ok', { status: res.status })
      return res.ok
    } catch (err) {
      this.logger.warn('keep-alive ping failed', { err })
      return false
    }
  }
}
