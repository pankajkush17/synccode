import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { DomainError } from '../../errors'
import type { Logger } from '../../logging/Logger'

/** Maps thrown errors to `{ status: 'error', kind, message }` responses. */
export class ErrorHandler {
  constructor(private readonly logger: Logger) {}

  readonly handle = (err: Error, c: Context): Response => {
    if (err instanceof DomainError) {
      return c.json(
        { status: 'error', kind: err.kind, message: err.message },
        err.httpStatus as ContentfulStatusCode,
      )
    }
    if (err instanceof HTTPException) {
      return c.json({ status: 'error', kind: 'http', message: err.message }, err.status)
    }
    // Unknown failures: log everything, reveal nothing.
    this.logger.error('unhandled http error', { err, path: c.req.path })
    return c.json({ status: 'error', kind: 'internal', message: 'internal server error' }, 500)
  }

  readonly notFound = (c: Context): Response =>
    c.json({ status: 'error', kind: 'not_found', message: `no route for ${c.req.path}` }, 404)
}
