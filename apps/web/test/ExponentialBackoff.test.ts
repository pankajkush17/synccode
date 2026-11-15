import { describe, expect, it } from 'vitest'
import { ExponentialBackoff } from '@/realtime/ExponentialBackoff'

describe('ExponentialBackoff', () => {
  it('doubles from the base and caps at the maximum (no jitter)', () => {
    const backoff = new ExponentialBackoff({ baseMs: 500, maxMs: 15_000, jitter: 0 })
    const delays = Array.from({ length: 8 }, () => backoff.next())
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 15_000, 15_000])
    expect(backoff.attempts).toBe(8)
  })

  it('reset() starts the schedule over', () => {
    const backoff = new ExponentialBackoff({ baseMs: 500, maxMs: 15_000, jitter: 0 })
    backoff.next()
    backoff.next()
    backoff.reset()
    expect(backoff.attempts).toBe(0)
    expect(backoff.next()).toBe(500)
  })

  it('keeps jittered delays within [ceiling × (1 − jitter), ceiling]', () => {
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 8000, jitter: 0.25, random })
      for (const ceiling of [1000, 2000, 4000, 8000, 8000]) {
        const delay = backoff.next()
        expect(delay).toBeGreaterThanOrEqual(ceiling * 0.75)
        expect(delay).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('never overflows after many attempts', () => {
    const backoff = new ExponentialBackoff({ baseMs: 500, maxMs: 15_000, jitter: 0 })
    for (let i = 0; i < 5000; i++) backoff.next()
    expect(backoff.next()).toBe(15_000)
  })

  it('rejects nonsensical options', () => {
    expect(() => new ExponentialBackoff({ baseMs: 0, maxMs: 10 })).toThrow(RangeError)
    expect(() => new ExponentialBackoff({ baseMs: 100, maxMs: 10 })).toThrow(RangeError)
  })
})
