import type { MiddlewareHandler } from 'hono'
import type { Logger } from '../../logging/Logger'

/** Logs one line per HTTP request. Path only — query strings never reach the log. */
export class RequestLogger {
  private static readonly QUIET_PATHS: ReadonlySet<string> = new Set([
    '/healthz',
    '/readyz',
    '/metrics',
  ])

  constructor(private readonly logger: Logger) {}

  readonly handler: MiddlewareHandler = async (c, next) => {
    const startedAt = performance.now()
    await next()
    if (RequestLogger.QUIET_PATHS.has(c.req.path)) return
    this.logger.info('http request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  }
}
