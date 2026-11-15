export interface BackoffOptions {
  readonly baseMs: number
  readonly maxMs: number
  /** 0–1: fraction of each delay that is randomised. Spreads reconnect storms. */
  readonly jitter?: number
  readonly random?: () => number
}

/**
 * Delay schedule for reconnect attempts: base, 2×base, 4×base … capped at max,
 * with jitter so a fleet of clients dropped by one deploy does not return in step.
 */
export class ExponentialBackoff {
  private attempt = 0
  private readonly jitter: number
  private readonly random: () => number

  constructor(private readonly options: BackoffOptions) {
    if (options.baseMs <= 0 || options.maxMs < options.baseMs) {
      throw new RangeError('backoff needs 0 < baseMs <= maxMs')
    }
    this.jitter = Math.min(Math.max(options.jitter ?? 0.25, 0), 1)
    this.random = options.random ?? Math.random
  }

  get attempts(): number {
    return this.attempt
  }

  /** The delay before the next attempt, in milliseconds. */
  next(): number {
    // Cap the exponent too: 2 ** 1024 is Infinity.
    const exponent = Math.min(this.attempt, 30)
    const ceiling = Math.min(this.options.baseMs * 2 ** exponent, this.options.maxMs)
    this.attempt++
    const spread = ceiling * this.jitter
    return Math.round(ceiling - spread + this.random() * spread)
  }

  reset(): void {
    this.attempt = 0
  }
}
