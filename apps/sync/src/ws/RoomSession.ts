import {
  AuthAckSchema,
  CloseCode,
  ControlPayload,
  ErrorMessageSchema,
  MessageType,
  messageTypeName,
} from '@synccode/shared'
import type { RawData, WebSocket } from 'ws'
import { Permission, permissionName } from '../auth/Permission'
import { DomainError, ProtocolError } from '../errors'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import type { Room } from '../rooms/Room'
import { BackpressureGuard } from './BackpressureGuard'
import type { MessageCodec } from './MessageCodec'

export interface RoomSessionOptions {
  readonly id: string
  readonly roomRef: number
  readonly permission: Permission
  readonly nodeName: string
  readonly maxBufferedBytes: number
}

/**
 * One connected client. Holds the socket, decodes its frames, enforces its
 * permission, and routes everything into the Room.
 */
export class RoomSession {
  readonly id: string
  readonly permission: Permission

  private readonly roomRef: number
  private readonly nodeName: string
  private readonly backpressure: BackpressureGuard
  /** Awareness client ids this socket introduced; removed from the room when it closes. */
  private readonly awarenessClients = new Set<number>()
  private closed = false

  constructor(
    options: RoomSessionOptions,
    readonly socket: WebSocket,
    private readonly room: Room,
    private readonly codec: MessageCodec,
    private readonly logger: Logger,
    private readonly metrics?: MetricsRegistry,
  ) {
    this.id = options.id
    this.permission = options.permission
    this.roomRef = options.roomRef
    this.nodeName = options.nodeName
    this.backpressure = new BackpressureGuard(socket, options.maxBufferedBytes, () => {
      this.metrics?.backpressureDrops.inc()
      this.logger.warn('socket send buffer overflow; disconnecting')
    })

    socket.on('message', (data, isBinary) => this.onMessage(data, isBinary))
    socket.on('close', () => this.onClose())
    socket.on('error', (err) => this.logger.warn('socket error', { err }))
  }

  get canWrite(): boolean {
    return this.permission === Permission.WRITE
  }

  get controlledClientIds(): number[] {
    return [...this.awarenessClients]
  }

  trackAwareness(added: readonly number[], removed: readonly number[]): void {
    for (const id of added) this.awarenessClients.add(id)
    for (const id of removed) this.awarenessClients.delete(id)
  }

  // ── outbound ────────────────────────────────────────────────────────────

  sendUpdate(payload: Uint8Array): void {
    this.send(MessageType.UPDATE, payload)
  }

  sendSyncStep1(stateVector: Uint8Array): void {
    this.send(MessageType.SYNC_STEP_1, stateVector)
  }

  sendSyncStep2(diff: Uint8Array): void {
    this.send(MessageType.SYNC_STEP_2, diff)
  }

  sendAwareness(payload: Uint8Array): void {
    this.send(MessageType.AWARENESS, payload)
  }

  sendAuthAck(): void {
    this.send(
      MessageType.AUTH_ACK,
      ControlPayload.encode(AuthAckSchema, {
        permission: permissionName(this.permission),
        nodeId: this.nodeName,
      }),
    )
  }

  sendError(kind: string, message: string): void {
    this.send(MessageType.ERROR, ControlPayload.encode(ErrorMessageSchema, { kind, message }))
  }

  /** Detaches from the room immediately, then closes the socket. Idempotent. */
  close(code: number, reason: string): void {
    this.onClose()
    if (
      this.socket.readyState === this.socket.OPEN ||
      this.socket.readyState === this.socket.CONNECTING
    ) {
      this.socket.close(code, reason)
    }
  }

  private send(type: MessageType, payload: Uint8Array): void {
    if (!this.backpressure.ok()) return
    this.socket.send(this.codec.encode(type, this.roomRef, payload), { binary: true })
    this.metrics?.messagesSent.inc({ type: messageTypeName(type) })
  }

  // ── inbound ─────────────────────────────────────────────────────────────

  private onMessage(data: RawData, isBinary: boolean): void {
    if (this.closed) return
    const stopTimer = this.metrics?.broadcastLatency.startTimer()
    try {
      if (!isBinary) throw new ProtocolError('text frames are not part of the protocol')
      const { type, roomRef, payload } = this.codec.decode(RoomSession.toBytes(data))
      if (roomRef !== this.roomRef) throw new ProtocolError(`unexpected roomRef ${roomRef}`)
      this.metrics?.messagesReceived.inc({ type: messageTypeName(type) })

      switch (type) {
        case MessageType.SYNC_STEP_1:
          this.room.handleSyncStep1(this, payload)
          break
        case MessageType.SYNC_STEP_2:
        case MessageType.UPDATE:
          if (!this.canWrite) throw new ProtocolError('write on read-only socket')
          this.room.applyRemoteUpdate(payload, this)
          stopTimer?.()
          break
        case MessageType.AWARENESS:
          this.room.applyAwareness(payload, this)
          break
        case MessageType.PING:
          this.send(MessageType.PONG, payload)
          break
        default:
          throw new ProtocolError(`unexpected ${messageTypeName(type)}`)
      }
    } catch (err) {
      this.fail(err)
    }
  }

  private fail(err: unknown): void {
    if (err instanceof DomainError) {
      this.logger.warn('closing session after protocol violation', {
        kind: err.kind,
        reason: err.message,
      })
      this.sendError(err.kind, err.message)
      this.close(CloseCode.PROTOCOL_ERROR, err.kind)
      return
    }
    this.logger.error('unexpected session failure', { err })
    this.close(1011, 'internal error')
  }

  private onClose(): void {
    if (this.closed) return
    this.closed = true
    this.room.detach(this)
  }

  private static toBytes(data: RawData): Uint8Array {
    if (Array.isArray(data)) return Buffer.concat(data)
    if (data instanceof ArrayBuffer) return new Uint8Array(data)
    return data
  }
}
