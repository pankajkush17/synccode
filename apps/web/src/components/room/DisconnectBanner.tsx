'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, WifiOff } from 'lucide-react'
import Link from 'next/link'
import { useConnectionStore } from '@/stores/connectionStore'

/** Amber while reconnecting, red when the server refused the connection for good. */
export function DisconnectBanner() {
  const state = useConnectionStore((s) => s.state)
  const hasSynced = useConnectionStore((s) => s.hasSynced)
  const fatalError = useConnectionStore((s) => s.fatalError)

  // Only after a first successful sync: the initial connect has its own loading state.
  const reconnecting = !fatalError && hasSynced && state !== 'OPEN'

  return (
    <AnimatePresence initial={false}>
      {fatalError ? (
        <motion.div
          key="fatal"
          role="alert"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden bg-danger-bg text-danger"
          data-testid="fatal-banner"
        >
          <p className="flex items-center gap-2 px-4 py-2 text-sm font-medium">
            <CircleAlert className="size-4 shrink-0" />
            <span>
              {fatalError}{' '}
              <Link href="/" className="underline underline-offset-2">
                Start a new room
              </Link>
            </span>
          </p>
        </motion.div>
      ) : reconnecting ? (
        <motion.div
          key="reconnecting"
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden bg-warn-bg text-warn-ink"
          data-testid="disconnect-banner"
        >
          <p className="flex items-center gap-2 px-4 py-2 text-sm font-medium">
            <WifiOff className="size-4 shrink-0" />
            Connection lost. Reconnecting. Keep typing, your changes sync when you are back.
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
