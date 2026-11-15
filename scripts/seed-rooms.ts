/**
 * Dev helper: creates a few rooms with starter content and prints their links.
 *
 *   pnpm seed                 # against http://localhost:4000
 *   SYNC_HTTP_URL=… WEB_URL=… pnpm seed
 */
import { CreateRoomResponseSchema, type LanguageId } from '@synccode/shared'
import { ProtocolClient } from '../apps/sync/src/testing/ProtocolClient'

const SYNC_HTTP_URL = (process.env.SYNC_HTTP_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const WEB_URL = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const SEEDS: Array<{ title: string; language: LanguageId; content: string }> = [
  {
    title: 'Two sum',
    language: 'typescript',
    content: `function twoSum(nums: number[], target: number): [number, number] | null {
  const seen = new Map<number, number>()
  for (const [i, n] of nums.entries()) {
    const j = seen.get(target - n)
    if (j !== undefined) return [j, i]
    seen.set(n, i)
  }
  return null
}
`,
  },
  {
    title: 'Fibonacci',
    language: 'python',
    content: `def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`,
  },
  {
    title: 'Top customers',
    language: 'sql',
    content: `select customer_id, sum(total) as revenue
from orders
where created_at >= now() - interval '30 days'
group by customer_id
order by revenue desc
limit 10;
`,
  },
]

async function seed(spec: (typeof SEEDS)[number]): Promise<void> {
  const res = await fetch(`${SYNC_HTTP_URL}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: spec.title, language: spec.language }),
  })
  if (!res.ok) throw new Error(`POST /rooms answered ${res.status}`)
  const room = CreateRoomResponseSchema.parse(await res.json())

  const wsBase = SYNC_HTTP_URL.replace(/^http/, 'ws')
  const client = new ProtocolClient(`${wsBase}/ws/${room.slug}?t=${room.editToken}`)
  await client.connect()
  client.text.insert(0, spec.content)
  await client.ping() // the server has applied the update
  await client.destroy()

  console.log(`${spec.title.padEnd(14)} edit: ${WEB_URL}/r/${room.slug}#t=${room.editToken}`)
  console.log(`${''.padEnd(14)} view: ${WEB_URL}/r/${room.slug}`)
}

try {
  for (const spec of SEEDS) await seed(spec)
} catch (err) {
  console.error(`Seeding failed: ${err instanceof Error ? err.message : err}`)
  console.error(`Is the sync server running at ${SYNC_HTTP_URL}?`)
  process.exit(1)
}
