import { CloseCode } from '@synccode/shared'
import { describe, expect, it } from 'vitest'
import { Logger } from '../../src/logging/Logger'
import { BackpressureGuard } from '../../src/ws/BackpressureGuard'
import { HeartbeatManager, type PingableSocket } from '../../src/ws/HeartbeatManager'

class StubSocket {
  readyState = 1
  bufferedAmount = 0
  closed: Array<{ code?: number; reason?: string }> = []
  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason })
    this.readyState = 2
  }
}

describe('BackpressureGuard', () => {
  it('allows sends while the buffer is under the limit', () => {
    const socket = new StubSocket()
    const guard = new BackpressureGuard(socket, 100)
    socket.bufferedAmount = 100
    expect(guard.ok()).toBe(true)
    expect(socket.closed).toHaveLength(0)
  })

  it('trips once, closes the socket, and stays tripped', () => {
    const socket = new StubSocket()
    let trips = 0
    const guard = new BackpressureGuard(socket, 100, () => trips++)
    socket.bufferedAmount = 101
    expect(guard.ok()).toBe(false)
    expect(guard.ok()).toBe(false)
    expect(trips).toBe(1)
    expect(socket.closed).toEqual([{ code: CloseCode.TRY_AGAIN_LATER, reason: 'backpressure' }])
  })

  it('refuses sends on a socket that is not open', () => {
    const socket = new StubSocket()
    socket.readyState = 3
    expect(new BackpressureGuard(socket, 100).ok()).toBe(false)
  })
})

class StubPingable implements PingableSocket {
  pings = 0
  terminated = false
  private pong: (() => void) | null = null
  ping(): void {
    this.pings++
  }
  terminate(): void {
    this.terminated = true
  }
  on(_event: 'pong', listener: () => void): void {
    this.pong = listener
  }
  answer(): void {
    this.pong?.()
  }
}

describe('HeartbeatManager', () => {
  it('keeps sockets that answer and terminates those that do not', () => {
    const heartbeat = new HeartbeatManager(1000, Logger.silent())
    const healthy = new StubPingable()
    const dead = new StubPingable()
    heartbeat.track(healthy)
    heartbeat.track(dead)

    heartbeat.tick()
    expect(healthy.pings).toBe(1)
    expect(dead.pings).toBe(1)
    healthy.answer()

    heartbeat.tick()
    expect(healthy.terminated).toBe(false)
    expect(healthy.pings).toBe(2)
    expect(dead.terminated).toBe(true)
    expect(heartbeat.trackedCount).toBe(1)
  })

  it('stops pinging untracked sockets', () => {
    const heartbeat = new HeartbeatManager(1000, Logger.silent())
    const socket = new StubPingable()
    heartbeat.track(socket)
    heartbeat.untrack(socket)
    heartbeat.tick()
    expect(socket.pings).toBe(0)
  })
})
