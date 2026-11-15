import { useEffect } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import { useConnectionStore } from '@/stores/connectionStore'
import { ConnectionManager } from './ConnectionManager'

/**
 * Runs a ConnectionManager for as long as the component is mounted: WebSocket
 * lifecycle, exponential-backoff reconnects and the state-vector handshake.
 * Pass `null` for any argument to stay disconnected.
 */
export function useConnection(
  url: string | null,
  doc: Y.Doc | null,
  awareness: Awareness | null,
): void {
  useEffect(() => {
    if (!url || !doc || !awareness) return
    const store = useConnectionStore.getState()
    const manager = new ConnectionManager(url, doc, awareness, {
      setState: store.setState,
      setLatency: store.setLatency,
      setSession: store.setSession,
      setFatalError: store.setFatalError,
    })
    manager.start()

    return () => {
      manager.stop()
      useConnectionStore.getState().reset()
    }
  }, [url, doc, awareness])
}
