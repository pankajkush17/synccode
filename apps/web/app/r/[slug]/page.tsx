import { type RoomMeta, RoomMetaSchema } from '@synccode/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { syncHttpUrl } from '@/config/serverConfig'
import { isValidSlug } from '@/util/slug'
import { RoomClient } from './RoomClient'

// Rooms are live; never serve a cached shell.
export const dynamic = 'force-dynamic'

async function loadRoom(slug: string): Promise<RoomMeta | null> {
  if (!isValidSlug(slug)) return null
  const res = await fetch(`${syncHttpUrl()}/rooms/${slug}/meta`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`sync service answered ${res.status}`)
  return RoomMetaSchema.parse(await res.json())
}

interface RoomPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { slug } = await params
  const room = await loadRoom(slug).catch(() => null)
  return {
    title: room?.title || 'Room',
    // Share links are capabilities; keep them out of search indexes.
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

/** Room shell (server component): confirms the room exists, then hands over to the client. */
export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params
  const room = await loadRoom(slug)
  if (!room) notFound()
  return <RoomClient room={room} />
}
