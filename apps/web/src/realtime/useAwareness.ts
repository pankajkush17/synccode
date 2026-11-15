import type { PresenceUser } from '@synccode/shared'
import { useEffect, useState } from 'react'
import { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import { type Peer, usePresenceStore } from '@/stores/presenceStore'
import { colorFor, isSafeColor } from '@/util/colorHash'
import { sanitizeName } from '@/util/identity'

function readPeers(awareness: Awareness): Peer[] {
  const peers: Peer[] = []
  for (const [clientId, state] of awareness.getStates()) {
    const user = (state as { user?: Partial<PresenceUser> }).user
    if (!user) continue
    // Everything in a peer's state is untrusted input: validate before it reaches the UI.
    const name = typeof user.name === 'string' ? sanitizeName(user.name) : ''
    peers.push({
      clientId,
      name: name || 'Anonymous',
      color: isSafeColor(user.color) ? user.color : colorFor(clientId).color,
      isSelf: clientId === awareness.clientID,
    })
  }
  // Self first, then a stable order so avatars do not shuffle.
  return peers.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.clientId - b.clientId)
}

/**
 * Owns the Awareness instance (presence + cursors) for a document, publishes
 * the local user into it, and mirrors every change into the presence store.
 */
export function useAwareness(doc: Y.Doc | null, name: string | null): Awareness | null {
  const [awareness, setAwareness] = useState<Awareness | null>(null)
  const setPeers = usePresenceStore((s) => s.setPeers)

  useEffect(() => {
    if (!doc) return
    const next = new Awareness(doc)
    const sync = () => setPeers(readPeers(next))
    next.on('change', sync)
    setAwareness(next)

    return () => {
      next.off('change', sync)
      next.destroy()
      setAwareness(null)
      setPeers([])
    }
  }, [doc, setPeers])

  useEffect(() => {
    if (!awareness || !name) return
    const user: PresenceUser = { name, color: colorFor(awareness.clientID).color }
    awareness.setLocalStateField('user', user)
  }, [awareness, name])

  return awareness
}
