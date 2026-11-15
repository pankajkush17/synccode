import { type CreateRoomResponse, CreateRoomResponseSchema } from '@synccode/shared'
import { inject } from 'vitest'
import { Config, type EnvInput } from '../../src/config/Config'
import { SyncServer } from '../../src/SyncServer'
import { ProtocolClient } from '../../src/testing/ProtocolClient'

export const TEST_EDIT_SECRET = 'ab'.repeat(32)

/** Spins up sync nodes inside the test process, all sharing one Postgres and one Redis. */
export class TestCluster {
  private readonly nodes: SyncServer[] = []
  private readonly clients: ProtocolClient[] = []

  async startNode(name: string, overrides: Partial<EnvInput> = {}): Promise<SyncServer> {
    const server = new SyncServer(
      Config.from({
        DATABASE_URL: inject('databaseUrl'),
        REDIS_URL: inject('redisUrl'),
        EDIT_SECRET: TEST_EDIT_SECRET,
        PORT: 0,
        LOG_LEVEL: 'silent',
        NODE_NAME: name,
        FLUSH_INTERVAL_MS: 50,
        ...overrides,
      }),
    )
    await server.start()
    this.nodes.push(server)
    return server
  }

  async stopNode(server: SyncServer): Promise<void> {
    await server.stop()
    const index = this.nodes.indexOf(server)
    if (index >= 0) this.nodes.splice(index, 1)
  }

  async createRoom(server: SyncServer, body: object = {}): Promise<CreateRoomResponse> {
    const res = await fetch(`${TestCluster.httpUrl(server)}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status !== 201) throw new Error(`POST /rooms → ${res.status}`)
    return CreateRoomResponseSchema.parse(await res.json())
  }

  /** A client that is not yet connected; it is cleaned up with the cluster. */
  client(server: SyncServer, slug: string, token?: string): ProtocolClient {
    const client = new ProtocolClient(TestCluster.wsUrl(server, slug, token))
    this.clients.push(client)
    return client
  }

  async connect(server: SyncServer, slug: string, token?: string): Promise<ProtocolClient> {
    const client = this.client(server, slug, token)
    await client.connect()
    return client
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.clients.map((c) => c.destroy()))
    await Promise.allSettled(this.nodes.map((n) => n.stop()))
    this.clients.length = 0
    this.nodes.length = 0
  }

  static httpUrl(server: SyncServer): string {
    return `http://127.0.0.1:${server.port}`
  }

  static wsUrl(server: SyncServer, slug: string, token?: string): string {
    const query = token ? `?t=${encodeURIComponent(token)}` : ''
    return `ws://127.0.0.1:${server.port}/ws/${slug}${query}`
  }
}
