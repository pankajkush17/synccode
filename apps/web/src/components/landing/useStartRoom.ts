import { CreateRoomResponseSchema, DEFAULT_LANGUAGE, type LanguageId } from '@synccode/shared'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { roomPath } from '@/util/slug'

export const START_ROOM_ERROR =
  'Could not start a room. Check that the sync server is running, then try again.'

/**
 * Creates a room and navigates into it holding the edit link. Shared by every
 * "Start a room" control so they all behave identically.
 */
export function useStartRoom(): {
  start: (language?: LanguageId) => Promise<void>
  pending: boolean
  error: string | null
} {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(
    async (language: LanguageId = DEFAULT_LANGUAGE) => {
      setPending(true)
      setError(null)
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ language }),
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const room = CreateRoomResponseSchema.parse(await res.json())
        // The token rides in the fragment, so it is never sent to any server by the browser.
        router.push(roomPath(room.slug, room.editToken))
      } catch {
        setError(START_ROOM_ERROR)
        setPending(false)
      }
    },
    [router],
  )

  return { start, pending, error }
}
