import type { ReactNode } from 'react'
import { cn } from '@/util/cn'

/** A titled, anchorable section of the engineering page. */
export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string
  title: string
  lede: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-line py-12 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="mt-3 max-w-[68ch] leading-relaxed text-muted">{lede}</p>
      <div className="mt-7">{children}</div>
    </section>
  )
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  )
}

/** The 3-byte frame header, drawn to (rough) scale. */
export function FrameLayout() {
  const cells = [
    { name: 'type', size: '1 byte', note: 'which of 8 messages', grow: 'w-24' },
    { name: 'roomRef', size: '2 bytes', note: 'assigned by the server at connect', grow: 'w-40' },
    {
      name: 'payload',
      size: 'N bytes',
      note: 'a Yjs update, state vector or awareness blob, untouched',
      grow: 'flex-1',
    },
  ]
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line font-mono text-sm sm:flex-row">
      {cells.map((cell, index) => (
        <div
          key={cell.name}
          className={cn(
            'border-line bg-surface p-3 sm:border-l sm:first:border-l-0',
            index > 0 && 'border-t sm:border-t-0',
            cell.grow,
            index === 2 && 'bg-accent-soft',
          )}
        >
          <div className="font-medium text-ink">{cell.name}</div>
          <div className="text-xs text-brand">{cell.size}</div>
          <div className="mt-1 font-sans text-xs leading-snug text-muted">{cell.note}</div>
        </div>
      ))}
    </div>
  )
}

const HANDSHAKE = [
  { dir: 'right', label: 'GET /ws/<room>?t=<token>', note: 'HTTP upgrade' },
  { dir: 'left', label: 'AUTH_ACK', note: 'permission + roomRef' },
  { dir: 'right', label: 'SYNC_STEP_1', note: 'my state vector' },
  { dir: 'left', label: 'SYNC_STEP_2', note: 'only what you are missing' },
  { dir: 'left', label: 'SYNC_STEP_1', note: 'the server’s state vector' },
  { dir: 'right', label: 'SYNC_STEP_2', note: 'edits you made offline' },
  { dir: 'both', label: 'UPDATE · AWARENESS', note: 'live, both directions' },
] as const

/** Sequence diagram of the connect handshake. */
export function Handshake() {
  const top = 46
  const gap = 36
  const height = top + HANDSHAKE.length * gap + 6
  return (
    <svg
      viewBox={`0 0 560 ${height}`}
      className="w-full max-w-xl font-sans"
      role="img"
      aria-label="Sequence diagram of the connection handshake between client and server"
    >
      <defs>
        <marker
          id="hs-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="context-stroke" />
        </marker>
      </defs>
      {[
        { x: 60, label: 'Client' },
        { x: 500, label: 'Sync node' },
      ].map((lane) => (
        <g key={lane.label}>
          <rect x={lane.x - 52} y="2" width="104" height="26" rx="8" className="fill-raised" />
          <text
            x={lane.x}
            y="20"
            fontSize="12.5"
            fontWeight="600"
            textAnchor="middle"
            className="fill-ink"
          >
            {lane.label}
          </text>
          <line
            x1={lane.x}
            y1="28"
            x2={lane.x}
            y2={height}
            strokeDasharray="3 4"
            className="stroke-line"
            strokeWidth="1.5"
          />
        </g>
      ))}
      {HANDSHAKE.map((message, index) => {
        const y = top + index * gap + 14
        const live = message.dir === 'both'
        return (
          <g key={`${message.label}-${message.note}`}>
            <line
              x1="66"
              x2="494"
              y1={y}
              y2={y}
              strokeWidth="1.75"
              className={live ? 'stroke-ok' : 'stroke-brand'}
              markerEnd={message.dir !== 'left' ? 'url(#hs-arrow)' : undefined}
              markerStart={message.dir !== 'right' ? 'url(#hs-arrow)' : undefined}
            />
            <text
              x="280"
              y={y - 6}
              fontSize="12"
              textAnchor="middle"
              className="fill-ink font-mono"
            >
              {message.label}
              <tspan className="fill-muted font-sans" dx="8" fontSize="11">
                {message.note}
              </tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LogRow({ id, kept }: { id: number; kept?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 items-center justify-center rounded-md border font-mono text-[11px]',
        kept ? 'border-ok text-ok' : 'border-line bg-paper text-muted',
      )}
    >
      {id}
    </span>
  )
}

const LOG_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/** Update log before and after compaction. */
export function CompactionFigure() {
  return (
    <div className="grid gap-5 rounded-2xl border border-line bg-surface p-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div>
        <div className="text-sm font-medium">Before: an append-only log</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LOG_IDS.map((id) => (
            <LogRow key={id} id={id} />
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          One <span className="font-mono">bytea</span> row per batch of keystrokes. Cheap to write,
          slow to replay.
        </p>
      </div>
      <div className="text-center font-mono text-xs text-muted md:px-2">
        one
        <br />
        transaction
      </div>
      <div>
        <div className="text-sm font-medium">
          After: one snapshot, plus whatever arrived meanwhile
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="flex h-8 items-center rounded-md bg-accent px-3 font-mono text-[11px] text-accent-ink">
            snapshot ≤ 12
          </span>
          <LogRow id={13} kept />
          <LogRow id={14} kept />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Rows written during compaction have higher ids than the cut, so they are never deleted.
        </p>
      </div>
    </div>
  )
}

const STATES = [
  { id: 'IDLE', x: 10 },
  { id: 'CONNECTING', x: 130 },
  { id: 'SYNCING', x: 300 },
  { id: 'OPEN', x: 440 },
] as const

/** The client connection state machine. */
export function StateMachine() {
  return (
    <svg
      viewBox="0 0 560 150"
      className="w-full max-w-xl font-mono"
      role="img"
      aria-label="Client connection state machine: idle, connecting, syncing, open, and reconnecting with backoff"
    >
      <defs>
        <marker
          id="sm-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill="context-stroke" />
        </marker>
      </defs>
      {STATES.map((state, index) => {
        const width = state.id.length * 8.4 + 24
        const next = STATES[index + 1]
        return (
          <g key={state.id}>
            <rect
              x={state.x}
              y="14"
              width={width}
              height="32"
              rx="8"
              className={
                state.id === 'OPEN' ? 'fill-accent-soft stroke-brand' : 'fill-surface stroke-line'
              }
              strokeWidth="1.5"
            />
            <text
              x={state.x + width / 2}
              y="35"
              fontSize="12"
              textAnchor="middle"
              className="fill-ink"
            >
              {state.id}
            </text>
            {next && (
              <line
                x1={state.x + width + 3}
                x2={next.x - 4}
                y1="30"
                y2="30"
                className="stroke-muted"
                strokeWidth="1.5"
                markerEnd="url(#sm-arrow)"
              />
            )}
          </g>
        )
      })}
      <text x="250" y="9" fontSize="10" textAnchor="middle" className="fill-muted font-sans">
        auth-ack
      </text>
      <text x="408" y="9" fontSize="10" textAnchor="middle" className="fill-muted font-sans">
        step 2
      </text>
      <rect
        x="250"
        y="104"
        width="126"
        height="32"
        rx="8"
        className="fill-warn-bg stroke-line"
        strokeWidth="1.5"
      />
      <text x="313" y="125" fontSize="12" textAnchor="middle" className="fill-warn-ink">
        RECONNECTING
      </text>
      <path
        d="M473 48 V120 H380"
        fill="none"
        className="stroke-muted"
        strokeWidth="1.5"
        markerEnd="url(#sm-arrow)"
      />
      <path
        d="M248 120 H190 V50"
        fill="none"
        className="stroke-muted"
        strokeWidth="1.5"
        markerEnd="url(#sm-arrow)"
      />
      <text x="482" y="92" fontSize="10" className="fill-muted font-sans">
        socket closed
      </text>
      <text x="74" y="92" fontSize="10" className="fill-muted font-sans">
        backoff 0.5 s → 15 s
      </text>
    </svg>
  )
}

/** Simple responsive table used for the rule and proof matrices. The first cell of a row is its key. */
export function DataTable({
  head,
  rows,
}: {
  head: readonly string[]
  rows: ReadonlyArray<readonly [string, ...ReactNode[]]>
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-raised">
            {head.map((cell) => (
              <th key={cell} className="px-4 py-2.5 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-line bg-surface align-top">
              {head.map((column, index) => (
                <td
                  key={column}
                  className={cn(
                    'px-4 py-3 leading-relaxed',
                    index === 0 ? 'font-medium text-ink' : 'text-muted',
                  )}
                >
                  {row[index]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
