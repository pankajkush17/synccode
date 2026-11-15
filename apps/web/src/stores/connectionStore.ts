import type { PermissionName } from '@synccode/shared'
import { create } from 'zustand'

export type ConnectionState = 'IDLE' | 'CONNECTING' | 'SYNCING' | 'OPEN' | 'RECONNECTING'

export interface SessionInfo {
  readonly permission: PermissionName
  /** Which sync node accepted this socket. */
  readonly nodeId: string
}

type ConnectionStore = {
  state: ConnectionState
  latencyMs: number | null
  session: SessionInfo | null
  /** Set when the server refused us for good (bad token, room gone). No retry follows. */
  fatalError: string | null
  /** True once the first sync finished — until then the editor shows a loading state. */
  hasSynced: boolean
  setState: (state: ConnectionState) => void
  setLatency: (latencyMs: number | null) => void
  setSession: (session: SessionInfo) => void
  setFatalError: (message: string) => void
  reset: () => void
}

const initial = {
  state: 'IDLE' as ConnectionState,
  latencyMs: null,
  session: null,
  fatalError: null,
  hasSynced: false,
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  ...initial,
  setState: (state) => set((prev) => ({ state, hasSynced: prev.hasSynced || state === 'OPEN' })),
  setLatency: (latencyMs) => set({ latencyMs }),
  setSession: (session) => set({ session }),
  setFatalError: (fatalError) => set({ fatalError, state: 'IDLE', latencyMs: null }),
  reset: () => set(initial),
}))
