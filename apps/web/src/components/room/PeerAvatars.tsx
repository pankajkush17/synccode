'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Tooltip } from '@/components/ui/Tooltip'
import { type Peer, usePresenceStore } from '@/stores/presenceStore'
import { initials, NAME_MAX_LENGTH } from '@/util/identity'

const MAX_VISIBLE = 5

function Avatar({ peer }: { peer: Peer }) {
  return (
    <span
      className="inline-flex size-8 select-none items-center justify-center rounded-full text-xs font-semibold text-[#14152b] ring-2 ring-surface"
      style={{ backgroundColor: peer.color }}
    >
      {initials(peer.name)}
    </span>
  )
}

function SelfAvatar({ peer, onRename }: { peer: Peer; onRename: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(peer.name)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onRename(draft)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(peer.name)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`You are ${peer.name}. Change your name`}
          className="rounded-full"
        >
          <Avatar peer={peer} />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="display-name" className="text-sm font-medium">
            Your name
          </label>
          <input
            id="display-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            className="h-9 rounded-lg border border-line bg-paper px-3 text-sm"
          />
          <p className="text-xs text-muted">Others see this next to your cursor.</p>
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Save name
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** Animated avatar bubbles: one per connected peer, yourself first. */
export function PeerAvatars({ onRename }: { onRename: (name: string) => void }) {
  const peers = usePresenceStore((s) => s.peers)
  const visible = peers.slice(0, MAX_VISIBLE)
  const hidden = peers.slice(MAX_VISIBLE)

  return (
    <ul
      className="flex items-center -space-x-2"
      aria-label="People in this room"
      data-testid="peer-avatars"
    >
      <AnimatePresence initial={false}>
        {visible.map((peer) => (
          <motion.li
            key={peer.clientId}
            layout
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex"
            data-testid="peer-avatar"
            data-self={peer.isSelf}
          >
            {peer.isSelf ? (
              <SelfAvatar peer={peer} onRename={onRename} />
            ) : (
              <Tooltip label={peer.name}>
                <span aria-label={peer.name} role="img">
                  <Avatar peer={peer} />
                </span>
              </Tooltip>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
      {hidden.length > 0 && (
        <li className="flex">
          <Tooltip label={hidden.map((p) => p.name).join(', ')}>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-raised text-xs font-semibold text-muted ring-2 ring-surface">
              +{hidden.length}
            </span>
          </Tooltip>
        </li>
      )}
    </ul>
  )
}
