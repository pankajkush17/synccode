import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  CloseCode,
  Codec,
  ControlPayload,
  EDIT_TOKEN_QUERY_KEY,
  ErrorMessageSchema,
  MessageType,
  SLUG_PATTERN,
} from '@synccode/shared'
import { type WebSocket, WebSocketServer } from 'ws'
import { Permission } from '../auth/Permission'
import type { TokenService } from '../auth/TokenService'
import { DomainError, NotFoundError, UnauthorizedError } from '../errors'
import type { NodeIdentity } from '../identity/NodeIdentity'
import type { Logger } from '../logging/Logger'
import type { MetricsRegistry } from '../metrics/MetricsRegistry'
import type { RoomManager } from '../rooms/RoomManager'
import type { HeartbeatManager } from './HeartbeatManager'
import type { MessageCodec } from './MessageCodec'
import { RoomSession } from './RoomSession'

export interface GatewayOptions {
  /** `null` allows any origin. */
  readonly allowedOrigins: readonly string[] | null
  readonly maxPayloadBytes: number
  readonly maxBufferedBytes: number
}

/**
 * Front door for WebSockets: `GET /ws/<slug>[?t=<editToken>]`.
 *
 * Validates the request, resolves the room, decides the socket's permission
 * from the edit token (none → READ, valid → WRITE, invalid → rejected), then
 * completes the upgrade and hands the socket to a new RoomSession.
 */
export class WebSocketGateway {
  static readonly PATH_PREFIX = '/ws/'

  private readonly wss: WebSocketServer
  private accepting = true
  private nextRoomRef = 0

  constructor(
    private readonly rooms: RoomManager,
    private readonly tokens: TokenService,
    private readonly codec: MessageCodec,
    private readonly heartbeat: HeartbeatManager,
    private readonly identity: NodeIdentity,
    private readonly options: GatewayOptions,
    private readonly logger: Logger,
    private readonly metrics?: MetricsRegistry,
  ) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: options.maxPayloadBytes,
      // Yjs updates are already compact binary; deflate would cost CPU for little gain.
      perMessageDeflate: false,
    })
  }

  get connectionCount(): number {
    return this.wss.clients.size
  }

  /** Bound to the HTTP server's `upgrade` event. Never throws. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy())
    this.upgrade(req, socket, head).catch((err: unknown) => {
      this.logger.error('upgrade failed', { err })
      WebSocketGateway.rejectHttp(socket, 500, 'Internal Server Error')
    })
  }

  stopAccepting(): void {
    this.accepting = false
  }

  /** Terminates whatever is still connected and releases the server. */
  close(): Promise<void> {
    this.accepting = false
    for (const client of this.wss.clients) client.terminate()
    return new Promise((resolve) => this.wss.close(() => resolve()))
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (!this.accepting) return WebSocketGateway.rejectHttp(socket, 503, 'Service Unavailable')

    const url = new URL(req.url ?? '/', 'http://sync.local')
    const slug = WebSocketGateway.slugFromPath(url.pathname)
    if (!slug) return WebSocketGateway.rejectHttp(socket, 404, 'Not Found')
    if (!this.isOriginAllowed(req.headers.origin)) {
      return WebSocketGateway.rejectHttp(socket, 403, 'Forbidden')
    }

    // Authorisation failures complete the handshake and then close with an
    // application code: browsers hide the HTTP status of a failed upgrade, so
    // this is the only way the client can tell "give up" from "retry".
    let failure: DomainError | null = null
    let room = null
    let permission = Permission.READ
    try {
      room = await this.rooms.get(slug)
      permission = this.authorize(
        slug,
        url.searchParams.get(EDIT_TOKEN_QUERY_KEY),
        room.editTokenHash,
      )
    } catch (err) {
      if (!(err instanceof DomainError)) throw err
      failure = err
    }

    if (socket.destroyed) return
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      if (failure || !room) {
        this.refuse(ws, failure ?? new NotFoundError(`room ${slug}`))
        return
      }

      const sessionId = randomUUID()
      const session = new RoomSession(
        {
          id: sessionId,
          roomRef: this.allocateRoomRef(),
          permission,
          nodeName: this.identity.name,
          maxBufferedBytes: this.options.maxBufferedBytes,
        },
        ws,
        room,
        this.codec,
        this.logger.child({ roomSlug: slug, sessionId }),
        this.metrics,
      )

      this.heartbeat.track(ws)
      this.metrics?.connections.inc()
      ws.on('close', () => {
        this.heartbeat.untrack(ws)
        this.metrics?.connections.dec()
      })

      if (!room.attach(session)) {
        // The room was evicted between lookup and upgrade; a retry will reload it.
        session.close(CloseCode.TRY_AGAIN_LATER, 'room reloading')
      }
    })
  }

  private authorize(slug: string, token: string | null, tokenHash: string): Permission {
    if (token === null || token === '') return Permission.READ
    if (!this.tokens.verifyEditToken(slug, token, tokenHash)) {
      throw new UnauthorizedError('invalid edit token')
    }
    return Permission.WRITE
  }

  private refuse(ws: WebSocket, error: DomainError): void {
    const code = error instanceof UnauthorizedError ? CloseCode.UNAUTHORIZED : CloseCode.NOT_FOUND
    ws.on('error', () => {})
    ws.send(
      new Codec().encode(
        MessageType.ERROR,
        0,
        ControlPayload.encode(ErrorMessageSchema, { kind: error.kind, message: error.message }),
      ),
      { binary: true },
      () => ws.close(code, error.kind),
    )
  }

  private isOriginAllowed(origin: string | undefined): boolean {
    const allowed = this.options.allowedOrigins
    if (allowed === null) return true
    // Non-browser clients (tests, load generator) send no Origin header.
    if (origin === undefined) return true
    return allowed.includes(origin.replace(/\/$/, ''))
  }

  private allocateRoomRef(): number {
    const ref = this.nextRoomRef
    this.nextRoomRef = (this.nextRoomRef + 1) & Codec.MAX_ROOM_REF
    return ref
  }

  private static slugFromPath(pathname: string): string | null {
    if (!pathname.startsWith(WebSocketGateway.PATH_PREFIX)) return null
    const slug = pathname.slice(WebSocketGateway.PATH_PREFIX.length)
    return SLUG_PATTERN.test(slug) ? slug : null
  }

  private static rejectHttp(socket: Duplex, status: number, text: string): void {
    if (socket.destroyed) return
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
}
