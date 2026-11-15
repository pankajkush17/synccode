'use client'

import { useStartRoom } from '@/components/landing/useStartRoom'

/** The compact "Start a room" button in the site header: one click, straight into a new room. */
export function StartRoomButton() {
  const { start, pending, error } = useStartRoom()
  return (
    <button
      type="button"
      onClick={() => start()}
      disabled={pending}
      title={error ?? undefined}
      data-testid="start-room-header"
      className="ml-2 inline-flex h-8 items-center rounded-md bg-accent px-3 font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Starting…' : error ? 'Try again' : 'Start a room'}
    </button>
  )
}
