import { CreateRoomRequestSchema, CreateRoomResponseSchema } from '@synccode/shared'
import { NextResponse } from 'next/server'
import { syncHttpUrl } from '@/config/serverConfig'

/**
 * Proxy to the sync service's `POST /rooms`. The browser never talks HTTP to
 * the sync service directly, so its address and CORS policy stay private.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => ({}))
  const parsed = CreateRoomRequestSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', kind: 'validation', message: 'Invalid room settings.' },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetch(`${syncHttpUrl()}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) throw new Error(`sync service answered ${upstream.status}`)
    const room = CreateRoomResponseSchema.parse(await upstream.json())
    return NextResponse.json(room, { status: 201, headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { status: 'error', kind: 'unavailable', message: 'The sync server is not reachable.' },
      { status: 502 },
    )
  }
}
