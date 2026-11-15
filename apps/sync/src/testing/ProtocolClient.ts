import {
  type AuthAck,
  AuthAckSchema,
  Codec,
  ControlPayload,
  DocKeys,
  type ErrorMessage,
  ErrorMessageSchema,
  MessageType,
} from '@synccode/shared'
import WebSocket from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'

export interface CloseInfo {
  readonly code: number
  readonly reason: string
}

/**
 * A headless reference client for the SyncCode wire protocol — the same
 * handshake the browser performs, without a browser. Used by the protocol
 * tests and the load generator.
 */
export class ProtocolClient {
  private static readonly REMOTE = Symbol('origin:remote')

  readonly doc = new Y.Doc()
  readonly awareness = new awarenessProtocol.Awareness(this.doc)
  readonly errors: ErrorMessage[] = []
  /** Byte size of the last SYNC_STEP_2 payload received (proves reconnects are O(delta)). */
  lastSyncStep2Bytes = 0
  auth: AuthAck | null = null

  private readonly codec = new Codec()
  private socket: WebSocket | null = null
  private roomRef = 0
  private synced = false
  private lastClose: CloseInfo | null = null
  private pongWaiters: Array<() => void> = []

  constructor(private readonly url: string) {
    // Stay invisible until a test (or the load generator) sets a presence state.
    this.awareness.setLocalState(null)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== ProtocolClient.REMOTE && this.canWrite) this.send(MessageType.UPDATE, update)
    })
    this.awareness.on(
      'update',
      (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === ProtocolClient.REMOTE) return
        const clients = [...changes.added, ...changes.updated, ...changes.removed]
        this.send(
          MessageType.AWARENESS,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
        )
      },
    )
  }

  get text(): Y.Text {
    return this.doc.getText(DocKeys.CONTENT)
  }

  get meta(): Y.Map<unknown> {
    return this.doc.getMap(DocKeys.META)
  }

  get canWrite(): boolean {
    return this.auth?.permission === 'write'
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  get closeInfo(): CloseInfo | null {
    return this.lastClose
  }

  /** Opens the socket and resolves once the initial sync (step 2) has been applied. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.synced = false
      this.auth = null
      this.lastClose = null
      const socket = new WebSocket(this.url)
      this.socket = socket

      socket.on('message', (data: Buffer) => {
        try {
          this.onFrame(data)
          if (this.synced) resolve()
        } catch (err) {
          reject(err)
        }
      })
      socket.on('close', (code, reason) => {
        this.lastClose = { code, reason: reason.toString() }
        if (this.socket === socket) this.socket = null
        reject(new Error(`socket closed before sync: ${code} ${reason.toString()}`))
      })
      socket.on('error', (err) => reject(err))
    })
  }

  /** Closes the socket and resolves once it is fully closed. The document is kept. */
  disconnect(): Promise<void> {
    const socket = this.socket
    if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      socket.once('close', () => resolve())
      socket.close(1000)
    })
  }

  /** Resolves when the server closes the socket. */
  waitForClose(timeoutMs = 5_000): Promise<CloseInfo> {
    return new Promise((resolve, reject) => {
      if (this.lastClose) return resolve(this.lastClose)
      const socket = this.socket
      if (!socket) return reject(new Error('not connected'))
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs)
      socket.once('close', (code, reason) => {
        clearTimeout(timer)
        resolve({ code, reason: reason.toString() })
      })
    })
  }

  /** Application-level ping; resolves with the round-trip time in milliseconds. */
  ping(): Promise<number> {
    const startedAt = performance.now()
    return new Promise((resolve) => {
      this.pongWaiters.push(() => resolve(performance.now() - startedAt))
      this.send(MessageType.PING, new Uint8Array(0))
    })
  }

  /** Sends an arbitrary frame, bypassing the client's own permission checks. */
  sendRaw(type: MessageType, payload: Uint8Array): void {
    this.send(type, payload)
  }

  async destroy(): Promise<void> {
    await this.disconnect()
    this.awareness.destroy()
    this.doc.destroy()
  }

  private send(type: MessageType, payload: Uint8Array): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(this.codec.encode(type, this.roomRef, payload))
  }

  private onFrame(data: Uint8Array): void {
    const { type, roomRef, payload } = this.codec.decode(data)
    switch (type) {
      case MessageType.AUTH_ACK:
        // The server speaks first: AUTH_ACK carries our permission and the
        // roomRef every later frame must use. Only then do we start syncing.
        this.auth = ControlPayload.decode(AuthAckSchema, payload)
        this.roomRef = roomRef
        this.send(MessageType.SYNC_STEP_1, Y.encodeStateVector(this.doc))
        if (this.awareness.getLocalState() !== null) {
          this.send(
            MessageType.AWARENESS,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
          )
        }
        break
      case MessageType.SYNC_STEP_1:
        // The server tells us what it has; answer with whatever it is missing.
        this.send(MessageType.SYNC_STEP_2, Y.encodeStateAsUpdate(this.doc, payload))
        break
      case MessageType.SYNC_STEP_2:
        this.lastSyncStep2Bytes = payload.byteLength
        Y.applyUpdate(this.doc, payload, ProtocolClient.REMOTE)
        this.synced = true
        break
      case MessageType.UPDATE:
        Y.applyUpdate(this.doc, payload, ProtocolClient.REMOTE)
        break
      case MessageType.AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, ProtocolClient.REMOTE)
        break
      case MessageType.ERROR:
        this.errors.push(ControlPayload.decode(ErrorMessageSchema, payload))
        break
      case MessageType.PONG:
        this.pongWaiters.shift()?.()
        break
      default:
        break
    }
  }
}
