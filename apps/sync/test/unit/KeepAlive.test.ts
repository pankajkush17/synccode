import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeepAlive } from '../../src/lifecycle/KeepAlive'
import { Logger } from '../../src/logging/Logger'

const logger = Logger.silent()

describe('KeepAlive', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pings the URL on every interval until stopped', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async (_url: string) => new Response('ok'))
    const keepAlive = new KeepAlive(
      { url: 'https://x.onrender.com/healthz', intervalMs: 1000 },
      logger,
      fetchImpl as unknown as typeof fetch,
    )

    keepAlive.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://x.onrender.com/healthz')

    keepAlive.stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('does nothing without a URL', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn()
    const keepAlive = new KeepAlive(
      { url: null, intervalMs: 1000 },
      logger,
      fetchImpl as unknown as typeof fetch,
    )
    keepAlive.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(keepAlive.enabled).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports failures without throwing', async () => {
    const down = new KeepAlive({ url: 'https://x.dev', intervalMs: 1000 }, logger, (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch)
    await expect(down.ping()).resolves.toBe(false)

    const unhealthy = new KeepAlive(
      { url: 'https://x.dev', intervalMs: 1000 },
      logger,
      (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
    )
    await expect(unhealthy.ping()).resolves.toBe(false)
  })
})
