/**
 * Load generator: N headless clients editing one room, measuring broadcast latency.
 *
 * Every client periodically types a character and stamps a shared map with the
 * send time. Every *other* client observes that stamp arriving and records
 * (arrival − send): the full path of an update — client → node → (Redis → node)
 * → client. Clients are spread round-robin over SYNC_URLS, so listing two nodes
 * measures the cross-node path.
 *
 *   pnpm load-test
 *   CLIENTS=50 DURATION_S=20 RATE_HZ=2 SYNC_URLS=ws://localhost:4001,ws://localhost:4002 pnpm load-test
 */
import { CreateRoomResponseSchema } from '@synccode/shared'
import type * as Y from 'yjs'
import { ProtocolClient } from '../apps/sync/src/testing/ProtocolClient'

const SYNC_URLS = (process.env.SYNC_URLS ?? 'ws://localhost:4000')
  .split(',')
  .map((u) => u.trim().replace(/\/$/, ''))
const CLIENTS = Number(process.env.CLIENTS ?? 50)
const DURATION_S = Number(process.env.DURATION_S ?? 15)
const RATE_HZ = Number(process.env.RATE_HZ ?? 2)

const STAMPS = 'loadtest'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}

async function createRoom(): Promise<{ slug: string; editToken: string }> {
  const httpUrl = SYNC_URLS[0]!.replace(/^ws/, 'http')
  const res = await fetch(`${httpUrl}/rooms`, { method: 'POST' })
  if (!res.ok) throw new Error(`POST /rooms answered ${res.status}`)
  return CreateRoomResponseSchema.parse(await res.json())
}

const { slug, editToken } = await createRoom()
console.log(
  `room ${slug}: ${CLIENTS} clients over ${SYNC_URLS.length} node(s), ${RATE_HZ} edits/s each, ${DURATION_S}s`,
)

const latencies: number[] = []
const clients = Array.from(
  { length: CLIENTS },
  (_, i) => new ProtocolClient(`${SYNC_URLS[i % SYNC_URLS.length]}/ws/${slug}?t=${editToken}`),
)

const connectStarted = performance.now()
await Promise.all(clients.map((c) => c.connect()))
console.log(`all connected and synced in ${(performance.now() - connectStarted).toFixed(0)} ms`)

let recording = false
for (const client of clients) {
  const stamps = client.doc.getMap<number>(STAMPS)
  stamps.observe((event: Y.YMapEvent<number>) => {
    // Only stamps that arrived over the wire; our own are local transactions.
    if (!recording || event.transaction.local) return
    const now = performance.now()
    for (const key of event.keysChanged) {
      const sentAt = stamps.get(key)
      if (sentAt !== undefined) latencies.push(now - sentAt)
    }
  })
}

let sent = 0
recording = true
const stopAt = performance.now() + DURATION_S * 1000
const writers = clients.map(async (client, i) => {
  await sleep(Math.random() * (1000 / RATE_HZ)) // de-synchronise the writers
  while (performance.now() < stopAt) {
    client.doc.transact(() => {
      client.text.insert(client.text.length, String.fromCharCode(97 + (i % 26)))
      client.doc.getMap<number>(STAMPS).set(String(i), performance.now())
    })
    sent++
    await sleep(1000 / RATE_HZ)
  }
})
await Promise.all(writers)

// Let the tail arrive, then confirm every replica ended up identical.
await sleep(1500)
recording = false
const reference = clients[0]!.text.toString()
const converged = clients.every((c) => c.text.toString() === reference)

latencies.sort((a, b) => a - b)
const expectedDeliveries = sent * (CLIENTS - 1)
console.log('')
console.log(`edits sent          ${sent}`)
console.log(
  `deliveries observed ${latencies.length} of ~${expectedDeliveries} (stamps can coalesce under load)`,
)
console.log(`document length     ${reference.length} chars`)
console.log(`converged           ${converged ? 'yes: all replicas identical' : 'NO'}`)
console.log(
  `broadcast latency   p50 ${percentile(latencies, 50).toFixed(1)} ms | p95 ${percentile(latencies, 95).toFixed(1)} ms | p99 ${percentile(latencies, 99).toFixed(1)} ms | max ${(latencies.at(-1) ?? Number.NaN).toFixed(1)} ms`,
)

await Promise.all(clients.map((c) => c.destroy()))
process.exit(converged ? 0 : 1)
