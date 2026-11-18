import { NextResponse } from 'next/server'
import { syncHttpUrl } from '@/config/serverConfig'

/**
 * Called once a day by Vercel Cron. The sync service keeps itself awake, but if
 * it ever does fall asleep (a missed self-ping, a redeploy) this wakes it again.
 * A cold start can take ~50s, hence the long timeout.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await fetch(`${syncHttpUrl()}/readyz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    })
    return NextResponse.json({ sync: upstream.ok ? 'awake' : 'unhealthy' }, { status: 200 })
  } catch {
    return NextResponse.json({ sync: 'unreachable' }, { status: 502 })
  }
}

export const maxDuration = 60
