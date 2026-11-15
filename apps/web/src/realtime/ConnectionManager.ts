import {
  AuthAckSchema,
  CloseCode,
  ControlPayload,
  ErrorMessageSchema,
  FATAL_CLOSE_CODES,
  MessageType,
} from '@synccode/shared'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { ConnectionState, SessionInfo } from '@/stores/connectionStore'
import { ExponentialBackoff } from './ExponentialBackoff'
import { decodeFrame, decodeTimestamp, encodeFrame, encodeTimestamp } from './protocolCodec'

/** Where the manager reports what happens. The connection store satisfies this. */
export interface ConnectionSink {
  setState(state: ConnectionState): void
  setLatency(latencyMs: number | null): void
  setSession(session: SessionInfo): void
  setFatalError(message: string): void
}

export interface ConnectionManagerOptions {
  readonly pingIntervalMs?: number
  /** No frame from the server for this long means the link is dead. */
  readonly silenceTimeoutMs?: number
  readonly backoff?: ExponentialBackoff
}

interface AwarenessChanges {
  added: number[]
  updated: number[]
  removed: number[]
}

/**
 * Keeps one WebSocket alive for one document.
 *
 * ```
 * IDLE ──start──► CONNECTING ──auth-ack──► SYNCING ──sync-step-2──► OPEN
 *                     ▲                                               │
 *                     └────────── backoff ── RECONNECTING ◄── close ──┘
 * ```
 *
 * The property that makes reconnection cheap: on every (re)connect the client
 * sends its state vector and receives only the diff. Ten minutes offline and
 * ten thousand missed operations cost one small message, not a replay.
 */
export class ConnectionManager {
  private socket: WebSocket | null = null
  private state: ConnectionState = 'IDLE'
  private readonly backoff: ExponentialBackoff
  private readonly pingIntervalMs: number
  private readonly silenceTimeoutMs: number

  /** Assigned by the server in AUTH_ACK; every frame we send must carry it. */
  private roomRef = 0
  private authed = false
  private canWrite = false
  private stopped = true
  private lastFrameAt = 0
  private lastServerError: string | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly url: string,
    private readonly doc: Y.Doc,
    private readonly awareness: awarenessProtocol.Awareness,
    private readonly sink: ConnectionSink,
    options: ConnectionManagerOptions = {},
  ) {
    this.backoff = options.backoff ?? new ExponentialBackoff({ baseMs: 500, maxMs: 15_000 })
    this.pingIntervalMs = options.pingIntervalMs ?? 5_000
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 20_000
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    window.addEventListener('online', this.onOnline)
    this.open()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    window.removeEventListener('online', this.onOnline)
    this.clearTimers()
    this.detachSocket(CloseCode.NORMAL)
    this.setState('IDLE')
  }

  // ── socket lifecycle ────────────────────────────────────────────────────

  private open(): void {
    if (this.stopped) return
    // A retry stays RECONNECTING (the banner should not flicker); a first attempt is CONNECTING.
    if (this.state !== 'RECONNECTING') this.setState('CONNECTING')
    this.authed = false
    this.canWrite = false
    this.lastServerError = null

    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.addEventListener('open', () => this.onOpen(socket))
    socket.addEventListener('message', (e) => this.onMessage(socket, e))
    socket.addEventListener('close', (e) => this.onClose(socket, e))
    socket.addEventListener('error', () => {
      /* a close event always follows */
    })
  }

  private onOpen(socket: WebSocket): void {
    if (socket !== this.socket) return
    this.lastFrameAt = performance.now()
    // Nothing is sent yet: the server speaks first (AUTH_ACK).
    this.pingTimer = setInterval(() => this.heartbeat(), this.pingIntervalMs)
  }

  private onClose(socket: WebSocket, event: CloseEvent): void {
    if (socket !== this.socket) return
    this.socket = null
    this.authed = false
    this.clearTimers()
    this.sink.setLatency(null)
    this.dropRemotePresence()
    if (this.stopped) return

    if (FATAL_CLOSE_CODES.has(event.code)) {
      // The server said no (bad token, room gone). Retrying cannot help.
      this.state = 'IDLE'
      this.sink.setFatalError(ConnectionManager.describeClose(event.code, this.lastServerError))
      return
    }

    this.setState('RECONNECTING')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, this.backoff.next())
  }

  private detachSocket(code: number): void {
    const socket = this.socket
    this.socket = null
    this.authed = false
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(code)
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.reconnectTimer = null
    this.pingTimer = null
  }

  /** Coming back online: do not wait out the rest of a long backoff. */
  private readonly onOnline = (): void => {
    if (this.stopped || this.state !== 'RECONNECTING' || !this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.backoff.reset()
    this.open()
  }

  private heartbeat(): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    if (performance.now() - this.lastFrameAt > this.silenceTimeoutMs) {
      // Half-open connection: the browser may not notice for minutes. Force the issue.
      socket.close(CloseCode.GOING_AWAY, 'server silent')
      // Some browsers delay the close event while the peer is unreachable.
      this.onClose(socket, new CloseEvent('close', { code: 1006 }))
      return
    }
    if (this.authed) this.send(MessageType.PING, encodeTimestamp(performance.now()))
  }

  // ── inbound ─────────────────────────────────────────────────────────────

  private onMessage(socket: WebSocket, event: MessageEvent): void {
    if (socket !== this.socket || !(event.data instanceof ArrayBuffer)) return
    this.lastFrameAt = performance.now()

    let frame: ReturnType<typeof decodeFrame>
    try {
      frame = decodeFrame(event.data)
    } catch {
      return // Unknown frame from a newer server: ignore rather than break the session.
    }

    try {
      this.dispatch(frame.type, frame.roomRef, frame.payload)
    } catch (err) {
      // A frame we cannot apply means our state may be inconsistent: resync from scratch.
      console.error('[synccode] failed to handle frame', err)
      socket.close(CloseCode.GOING_AWAY, 'resync')
    }
  }

  private dispatch(type: MessageType, roomRef: number, payload: Uint8Array): void {
    switch (type) {
      case MessageType.AUTH_ACK: {
        const ack = ControlPayload.decode(AuthAckSchema, payload)
        this.roomRef = roomRef
        this.authed = true
        this.canWrite = ack.permission === 'write'
        this.sink.setSession({ permission: ack.permission, nodeId: ack.nodeId })
        this.setState('SYNCING')
        // Step 1: "here is what I have — send me what I am missing."
        this.send(MessageType.SYNC_STEP_1, Y.encodeStateVector(this.doc))
        this.publishLocalPresence()
        break
      }
      case MessageType.SYNC_STEP_1:
        // The server's own step 1: answer with whatever it lacks (our offline edits).
        if (this.canWrite) {
          this.send(MessageType.SYNC_STEP_2, Y.encodeStateAsUpdate(this.doc, payload))
        }
        break
      case MessageType.SYNC_STEP_2:
        Y.applyUpdate(this.doc, payload, this)
        this.backoff.reset()
        this.setState('OPEN')
        break
      case MessageType.UPDATE:
        Y.applyUpdate(this.doc, payload, this)
        break
      case MessageType.AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, this)
        break
      case MessageType.PONG: {
        const sentAt = decodeTimestamp(payload)
        if (sentAt !== null)
          this.sink.setLatency(Math.max(0, Math.round(performance.now() - sentAt)))
        break
      }
      case MessageType.ERROR:
        this.lastServerError = ControlPayload.decode(ErrorMessageSchema, payload).message
        break
      default:
        break
    }
  }

  // ── outbound ────────────────────────────────────────────────────────────

  private send(type: MessageType, payload: Uint8Array): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.authed) return
    socket.send(encodeFrame(type, this.roomRef, payload))
  }

  /**
   * Local edits go out as they happen. Anything produced while the socket is
   * down is not queued: the next handshake's state-vector exchange carries it.
   */
  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || !this.canWrite) return
    this.send(MessageType.UPDATE, update)
  }

  private readonly onAwarenessUpdate = (changes: AwarenessChanges, origin: unknown): void => {
    if (origin === this) return
    const clients = [...changes.added, ...changes.updated, ...changes.removed]
    this.send(
      MessageType.AWARENESS,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
    )
  }

  private publishLocalPresence(): void {
    if (this.awareness.getLocalState() === null) return
    this.send(
      MessageType.AWARENESS,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
    )
  }

  /** While offline we cannot know who is still there; show nobody rather than ghosts. */
  private dropRemotePresence(): void {
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID)
    if (others.length > 0) awarenessProtocol.removeAwarenessStates(this.awareness, others, this)
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.sink.setState(state)
  }

  /** Plain-language reason for a fatal close; the server's wording is only a fallback. */
  private static describeClose(code: number, serverMessage: string | null): string {
    switch (code) {
      case CloseCode.UNAUTHORIZED:
        return 'This edit link is not valid for this room. Ask for a new link, or open the room without it to watch.'
      case CloseCode.NOT_FOUND:
        return 'This room no longer exists.'
      default:
        return serverMessage
          ? `The server closed the connection: ${serverMessage}.`
          : 'The server closed the connection.'
    }
  }
}
