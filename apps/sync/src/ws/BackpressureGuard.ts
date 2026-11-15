import { CloseCode } from '@synccode/shared'

/** The slice of a WebSocket the guard needs — keeps it trivially testable. */
export interface BufferedSocket {
  readonly readyState: number
  readonly bufferedAmount: number
  close(code?: number, reason?: string): void
}

/**
 * Watches one socket's send buffer. A client that reads slower than the room
 * writes would otherwise make the server buffer without bound; past the limit
 * we disconnect it instead. Nothing is lost: it reconnects and catches up with
 * a single state-vector diff.
 */
export class BackpressureGuard {
  private static readonly OPEN = 1
  private tripped = false

  constructor(
    private readonly socket: BufferedSocket,
    private readonly maxBufferedBytes: number,
    private readonly onTrip?: () => void,
  ) {}

  /** True if it is safe to send. Trips (and closes the socket) on overflow. */
  ok(): boolean {
    if (this.tripped || this.socket.readyState !== BackpressureGuard.OPEN) return false
    if (this.socket.bufferedAmount > this.maxBufferedBytes) {
      this.tripped = true
      this.onTrip?.()
      this.socket.close(CloseCode.TRY_AGAIN_LATER, 'backpressure')
      return false
    }
    return true
  }
}
