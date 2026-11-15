'use client'

import { languageLabel } from '@synccode/shared'
import { type ConnectionState, useConnectionStore } from '@/stores/connectionStore'
import { useEditorStore } from '@/stores/editorStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { cn } from '@/util/cn'

const STATE_LABEL: Record<ConnectionState, string> = {
  IDLE: 'Offline',
  CONNECTING: 'Connecting',
  SYNCING: 'Syncing',
  OPEN: 'Connected',
  RECONNECTING: 'Reconnecting',
}

function dotClass(state: ConnectionState, failed: boolean): string {
  if (failed) return 'bg-danger'
  if (state === 'OPEN') return 'bg-ok'
  if (state === 'IDLE') return 'bg-muted'
  return 'bg-[#f5a524] animate-pulse'
}

/** Connection state, latency, who is here, and where your cursor is. */
export function StatusBar() {
  const state = useConnectionStore((s) => s.state)
  const latencyMs = useConnectionStore((s) => s.latencyMs)
  const session = useConnectionStore((s) => s.session)
  const failed = useConnectionStore((s) => s.fatalError !== null)
  const peerCount = usePresenceStore((s) => s.peers.length)
  const language = useEditorStore((s) => s.language)
  const cursor = useEditorStore((s) => s.cursor)

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-4 text-xs text-muted">
      <span className="flex items-center gap-2" data-testid="connection-status" data-state={state}>
        <span className={cn('size-2 rounded-full', dotClass(state, failed))} />
        <span className="font-medium text-ink">{failed ? 'Disconnected' : STATE_LABEL[state]}</span>
      </span>

      {state === 'OPEN' && latencyMs !== null && (
        <span className="tabular-nums">{latencyMs} ms</span>
      )}

      {peerCount > 0 && (
        <span data-testid="editor-count">
          {peerCount} {peerCount === 1 ? 'person' : 'people'} here
        </span>
      )}

      {session?.permission === 'read' && (
        <span
          className="rounded bg-raised px-1.5 py-0.5 font-medium text-ink"
          data-testid="read-only-badge"
        >
          View only
        </span>
      )}

      <span className="ml-auto hidden items-center gap-4 sm:flex">
        {session && <span title="The sync node serving this tab">Node {session.nodeId}</span>}
        {cursor && (
          <span className="tabular-nums">
            Ln {cursor.line}, Col {cursor.column}
          </span>
        )}
        <span>{languageLabel(language)}</span>
      </span>
    </footer>
  )
}
