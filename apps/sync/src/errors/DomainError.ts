/**
 * Base class for every expected failure. `kind` is the stable machine-readable
 * code sent to clients; `httpStatus` is how ErrorHandler maps it to HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: string
  abstract readonly httpStatus: number

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}
