'use client'

import { useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/util/cn'

type NodeId = 'alice' | 'bob' | 'nodeA' | 'nodeB' | 'redis' | 'postgres'
type EdgeId = 'send' | 'persist' | 'publish' | 'echo' | 'fanout' | 'deliver'

const W = 170
const H = 56
const NODES: Record<NodeId, { x: number; y: number; label: string; sub: string }> = {
  alice: { x: 20, y: 20, label: "Alice's browser", sub: 'Monaco + Yjs' },
  bob: { x: 570, y: 20, label: "Bob's browser", sub: 'Monaco + Yjs' },
  nodeA: { x: 20, y: 150, label: 'Sync node A', sub: 'Room · Y.Doc in memory' },
  redis: { x: 295, y: 150, label: 'Redis', sub: 'pub/sub channel per room' },
  nodeB: { x: 570, y: 150, label: 'Sync node B', sub: 'Room · Y.Doc in memory' },
  postgres: { x: 295, y: 280, label: 'Postgres', sub: 'update log + snapshots' },
}

const EDGES: Record<EdgeId, { d: string; label?: { x: number; y: number; text: string } }> = {
  send: { d: 'M105 76 V150', label: { x: 114, y: 118, text: 'WebSocket' } },
  publish: { d: 'M190 168 H295', label: { x: 242, y: 160, text: 'PUBLISH' } },
  echo: { d: 'M295 190 H190' },
  fanout: { d: 'M465 178 H570', label: { x: 517, y: 170, text: 'SUBSCRIBE' } },
  deliver: { d: 'M655 150 V76', label: { x: 664, y: 118, text: 'WebSocket' } },
  persist: { d: 'M105 206 V308 H295', label: { x: 114, y: 262, text: 'batched INSERT' } },
}

/** One keystroke, in order. A real sequence, so the steps are numbered. */
const STEPS: Array<{
  title: string
  body: string
  wire?: string
  nodes: NodeId[]
  edges: EdgeId[]
}> = [
  {
    title: 'Alice types "x"',
    body: 'The editor binding turns the keystroke into an insert on a shared Y.Text. Yjs emits an update: the character plus the id of the item it was typed after.',
    wire: 'update U ≈ 20 bytes',
    nodes: ['alice'],
    edges: [],
  },
  {
    title: 'One binary frame to node A',
    body: 'The client prepends a 3-byte header and sends it over the open WebSocket. No JSON anywhere on the data path.',
    wire: '02 │ 00 07 │ U      type=UPDATE, roomRef=7',
    nodes: ['alice', 'nodeA'],
    edges: ['send'],
  },
  {
    title: 'Node A applies it and queues the write',
    body: 'The session checks the socket may write, then the room applies U to its in-memory document. U joins a dirty set that is flushed to Postgres in one batched INSERT, at most every 500 ms.',
    nodes: ['nodeA', 'postgres'],
    edges: ['persist'],
  },
  {
    title: 'Node A publishes to Redis',
    body: 'The update goes to the room’s channel wrapped in an envelope stamped with this node’s id.',
    wire: 'nodeId (16) │ kind (1) │ U',
    nodes: ['nodeA', 'redis'],
    edges: ['publish'],
  },
  {
    title: 'Redis fans out, and node A drops its own echo',
    body: 'Every node subscribed to the room receives the message, including the sender. Node A sees its own id in the header and discards it. Without that check it would re-apply and re-publish forever.',
    nodes: ['redis', 'nodeA', 'nodeB'],
    edges: ['echo', 'fanout'],
  },
  {
    title: 'Node B delivers it to Bob',
    body: 'Node B applies U with origin "redis", which means: send to local sockets, do not publish again, do not persist. Bob’s editor shows the "x".',
    nodes: ['nodeB', 'bob'],
    edges: ['deliver'],
  },
]

const STEP_MS = 3200

export function KeystrokeJourney() {
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const active = STEPS[step]!

  useEffect(() => {
    if (!playing || reduceMotion) return
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(timer)
  }, [playing, reduceMotion])

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="p-3 sm:p-6">
          <svg
            viewBox="0 0 760 356"
            className="w-full font-sans"
            role="img"
            aria-label={`Step ${step + 1}: ${active.title}`}
          >
            <defs>
              <marker
                id="journey-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0 0L10 5L0 10z" fill="context-stroke" />
              </marker>
            </defs>

            {(Object.keys(EDGES) as EdgeId[]).map((id) => {
              const edge = EDGES[id]
              const on = active.edges.includes(id)
              const isEcho = id === 'echo'
              return (
                <g key={id} className={cn(isEcho && !on && 'opacity-0')}>
                  <path
                    d={edge.d}
                    fill="none"
                    markerEnd="url(#journey-arrow)"
                    strokeWidth={on ? 2.5 : 1.5}
                    strokeDasharray={isEcho ? '5 5' : undefined}
                    className={cn(
                      'transition-colors duration-300',
                      on ? (isEcho ? 'stroke-danger' : 'stroke-brand') : 'stroke-line',
                    )}
                  />
                  {edge.label && (
                    <text
                      x={edge.label.x}
                      y={edge.label.y}
                      fontSize="11"
                      textAnchor={
                        edge.d.includes('H') && !edge.d.includes('V') ? 'middle' : 'start'
                      }
                      className={on ? 'fill-brand' : 'fill-muted'}
                    >
                      {edge.label.text}
                    </text>
                  )}
                  {isEcho && on && (
                    <text x="242" y="208" fontSize="11" textAnchor="middle" className="fill-danger">
                      own id → dropped
                    </text>
                  )}
                  {on && !reduceMotion && (
                    <circle
                      key={`${id}-${step}`}
                      r="5.5"
                      className={isEcho ? 'fill-danger' : 'fill-brand'}
                    >
                      <animateMotion dur="1.1s" repeatCount="indefinite" path={edge.d} />
                    </circle>
                  )}
                </g>
              )
            })}

            {(Object.keys(NODES) as NodeId[]).map((id) => {
              const node = NODES[id]
              const on = active.nodes.includes(id)
              return (
                <g key={id}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={W}
                    height={H}
                    rx="12"
                    strokeWidth={on ? 2 : 1.5}
                    className={cn(
                      'transition-colors duration-300',
                      on ? 'fill-accent-soft stroke-brand' : 'fill-paper stroke-line',
                    )}
                  />
                  <text
                    x={node.x + W / 2}
                    y={node.y + 24}
                    fontSize="13.5"
                    fontWeight="600"
                    textAnchor="middle"
                    className="fill-ink"
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x + W / 2}
                    y={node.y + 41}
                    fontSize="10.5"
                    textAnchor="middle"
                    className="fill-muted"
                  >
                    {node.sub}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* What the highlighted step means. A fixed minimum height keeps the page from jumping. */}
        <div
          className="min-h-36 border-t border-line bg-paper/60 px-5 py-4 sm:px-6"
          aria-live="polite"
        >
          <p className="text-sm font-medium">
            <span className="mr-2 font-mono text-brand">
              {step + 1}/{STEPS.length}
            </span>
            {active.title}
          </p>
          <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted">{active.body}</p>
          {active.wire && (
            <code className="mt-2.5 inline-block max-w-full overflow-x-auto rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-xs whitespace-pre text-ink">
              {active.wire}
            </code>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <ol className="grid flex-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((item, index) => {
            const on = index === step
            return (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(index)
                    setPlaying(false)
                  }}
                  aria-current={on ? 'step' : undefined}
                  className={cn(
                    'flex h-full w-full gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    on ? 'border-brand bg-accent-soft' : 'border-line bg-surface hover:bg-raised',
                  )}
                >
                  <span className={cn('font-mono', on ? 'text-brand' : 'text-muted')}>
                    {index + 1}
                  </span>
                  <span className={on ? 'font-medium' : 'text-muted'}>{item.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
        {!reduceMotion && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-raised"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
      </div>
    </div>
  )
}
