import { create } from 'zustand'

export interface Peer {
  readonly clientId: number
  readonly name: string
  readonly color: string
  readonly isSelf: boolean
}

type PresenceStore = {
  peers: Peer[]
  setPeers: (peers: Peer[]) => void
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  peers: [],
  setPeers: (peers) => set({ peers }),
}))
