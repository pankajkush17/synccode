import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { Logger } from '../logging/Logger'
import type { WebSocketGateway } from '../ws/WebSocketGateway'
import { ErrorHandler } from './middleware/ErrorHandler'
import { RequestLogger } from './middleware/RequestLogger'

/** Anything that can mount itself on the Hono app. */
export interface RouteModule {
  register(app: Hono): void
}

export interface HttpServerOptions {
  readonly port: number
  /** `null` allows any origin. */
  readonly allowedOrigins: readonly string[] | null
}

/**
 * The Hono app plus the Node HTTP server underneath it. Plain HTTP goes to
 * Hono; `Upgrade: websocket` requests are handed to the WebSocketGateway.
 */
export class HttpServer {
  private static readonly MAX_BODY_BYTES = 16 * 1024

  private readonly app = new Hono()
  private server: Server | null = null
  private draining = false

  constructor(
    private readonly options: HttpServerOptions,
    routes: readonly RouteModule[],
    private readonly gateway: WebSocketGateway,
    private readonly logger: Logger,
  ) {
    const errors = new ErrorHandler(logger)
    this.app.use('*', new RequestLogger(logger).handler)
    this.app.use(
      '*',
      cors({
        origin: options.allowedOrigins === null ? '*' : [...options.allowedOrigins],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        maxAge: 600,
      }),
    )
    this.app.use('*', bodyLimit({ maxSize: HttpServer.MAX_BODY_BYTES }))
    for (const route of routes) route.register(this.app)
    this.app.onError(errors.handle)
    this.app.notFound(errors.notFound)
  }

  get isDraining(): boolean {
    return this.draining
  }

  /** The bound port (useful when configured with port 0). */
  get port(): number {
    const address = this.server?.address() as AddressInfo | null
    if (!address) throw new Error('HttpServer is not listening')
    return address.port
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = serve({ fetch: this.app.fetch, port: this.options.port }, (info) => {
        server.off('error', reject)
        this.logger.info('http listening', { port: info.port })
        resolve(info.port)
      }) as Server
      server.once('error', reject)
      server.on('upgrade', (req, socket, head) => this.gateway.handleUpgrade(req, socket, head))
      this.server = server
    })
  }

  /** Step one of shutdown: fail readiness and refuse new sockets, keep serving the rest. */
  stopAcceptingNew(): void {
    this.draining = true
    this.gateway.stopAccepting()
  }

  /** Final step of shutdown: drop remaining sockets and release the port. */
  async close(): Promise<void> {
    await this.gateway.close()
    const server = this.server
    if (!server) return
    this.server = null
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }
}
