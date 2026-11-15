'use client'

import { Link2, Link2Off, RotateCcw, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { cn } from '@/util/cn'

const SEED = 'const total = price * qty'
const REMOTE = 'remote'

interface Replica {
  readonly name: string
  readonly color: string
  readonly doc: Y.Doc
}

interface SyncLog {
  readonly vectorBytes: number
  readonly toAlice: number
  readonly toBob: number
}

/** Smallest single replace that turns `prev` into `next` (what a textarea edit is). */
function applyTextareaEdit(text: Y.Text, prev: string, next: string): void {
  let start = 0
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++
  let end = 0
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  )
    end++
  text.doc?.transact(() => {
    if (prev.length - start - end > 0) text.delete(start, prev.length - start - end)
    if (next.length - start - end > 0) text.insert(start, next.slice(start, next.length - end))
  })
}

/** A state vector, spelled out: how many operations of each author this replica has seen. */
function describeVector(doc: Y.Doc, replicas: readonly Replica[]): string {
  const vector = Y.decodeStateVector(Y.encodeStateVector(doc))
  return replicas.map((r) => `${r.name} ${vector.get(r.doc.clientID) ?? 0}`).join(' · ')
}

/**
 * Two real Yjs documents in this page — the same library the editor and the
 * server run. Cut the link, edit both sides, reconnect: the two state vectors
 * are exchanged, each side receives only the diff, and the texts converge.
 */
export function ConvergenceLab() {
  const replicas = useRef<[Replica, Replica] | null>(null)
  const linked = useRef(true)
  const [connected, setConnected] = useState(true)
  const [texts, setTexts] = useState<[string, string]>([SEED, SEED])
  const [vectors, setVectors] = useState<[string, string]>(['', ''])
  const [log, setLog] = useState<SyncLog | null>(null)
  const [generation, setGeneration] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` is the reset trigger
  useEffect(() => {
    const alice: Replica = { name: 'Alice', color: '#8b7bff', doc: new Y.Doc() }
    const bob: Replica = { name: 'Bob', color: '#ff7a90', doc: new Y.Doc() }
    const pair: [Replica, Replica] = [alice, bob]
    replicas.current = pair
    linked.current = true

    const refresh = () => {
      setTexts([alice.doc.getText('t').toString(), bob.doc.getText('t').toString()])
      setVectors([describeVector(alice.doc, pair), describeVector(bob.doc, pair)])
    }
    // While linked, every local update is forwarded — the server's job, in miniature.
    const forward = (to: Y.Doc) => (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE && linked.current) Y.applyUpdate(to, update, REMOTE)
      refresh()
    }
    alice.doc.on('update', forward(bob.doc))
    bob.doc.on('update', forward(alice.doc))
    alice.doc.getText('t').insert(0, SEED)

    setConnected(true)
    setLog(null)
    refresh()
    return () => {
      alice.doc.destroy()
      bob.doc.destroy()
    }
  }, [generation])

  const edit = (index: 0 | 1, next: string) => {
    const text = replicas.current?.[index].doc.getText('t')
    // Diff against the document itself, not React state: state can lag a fast typist by a render.
    if (text) applyTextareaEdit(text, text.toString(), next)
  }

  const reconnect = useCallback(() => {
    const pair = replicas.current
    if (!pair) return
    const [alice, bob] = pair
    // The handshake: swap state vectors, then send each side exactly what it lacks.
    const aliceVector = Y.encodeStateVector(alice.doc)
    const bobVector = Y.encodeStateVector(bob.doc)
    const forAlice = Y.encodeStateAsUpdate(bob.doc, aliceVector)
    const forBob = Y.encodeStateAsUpdate(alice.doc, bobVector)
    linked.current = true
    Y.applyUpdate(alice.doc, forAlice, REMOTE)
    Y.applyUpdate(bob.doc, forBob, REMOTE)
    setLog({
      vectorBytes: aliceVector.byteLength + bobVector.byteLength,
      toAlice: forAlice.byteLength,
      toBob: forBob.byteLength,
    })
    setConnected(true)
  }, [])

  const cut = () => {
    linked.current = false
    setConnected(false)
    setLog(null)
  }

  /** The classic conflict: both insert at the very same position while apart. */
  const collide = () => {
    const pair = replicas.current
    if (!pair) return
    cut()
    const at = pair[0].doc.getText('t').toString().indexOf('price')
    const position = Math.max(at, 0)
    pair[0].doc.getText('t').insert(position, 'tax + ')
    pair[1].doc.getText('t').insert(position, 'shipping + ')
  }

  const diverged = texts[0] !== texts[1]
  const names = ['Alice', 'Bob'] as const
  const colors = ['#8b7bff', '#ff7a90'] as const

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={collide}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          <Zap className="size-4" />
          Both type at the same spot
        </button>
        {connected ? (
          <button
            type="button"
            onClick={cut}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium hover:bg-raised"
          >
            <Link2Off className="size-4" />
            Cut the connection
          </button>
        ) : (
          <button
            type="button"
            onClick={reconnect}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand px-3 text-sm font-medium text-brand hover:bg-accent-soft"
            data-testid="lab-reconnect"
          >
            <Link2 className="size-4" />
            Reconnect
          </button>
        )}
        <button
          type="button"
          onClick={() => setGeneration((g) => g + 1)}
          aria-label="Reset the demo"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink"
        >
          <RotateCcw className="size-4" />
        </button>
        <span
          className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-xs font-medium',
            diverged ? 'bg-warn-bg text-warn-ink' : 'bg-accent-soft text-brand',
          )}
          role="status"
          data-testid="lab-status"
        >
          {diverged ? 'Diverged' : connected ? 'In sync' : 'Offline, still identical'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {([0, 1] as const).map((index) => (
          <label key={names[index]} className="block">
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
              {names[index]}’s copy
            </span>
            <textarea
              value={texts[index]}
              onChange={(e) => edit(index, e.target.value)}
              spellCheck={false}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-line bg-paper p-3 font-mono text-[13px] leading-relaxed"
              data-testid={`lab-text-${index}`}
            />
            <span className="mt-1 block font-mono text-xs text-muted">
              has seen: {vectors[index]}
            </span>
          </label>
        ))}
      </div>

      <p className="mt-4 min-h-10 text-sm leading-relaxed text-muted" aria-live="polite">
        {log ? (
          <>
            Reconnected. The two state vectors were {log.vectorBytes} bytes in total. Alice received
            a <strong className="font-medium text-ink">{log.toAlice}-byte</strong> diff and Bob a{' '}
            <strong className="font-medium text-ink">{log.toBob}-byte</strong> diff. Neither side
            resent the document, and both now hold the same text.
          </>
        ) : connected ? (
          'Type in either box: every keystroke is forwarded. Or cut the connection and edit both sides.'
        ) : (
          'The connection is cut. Edit either copy, then reconnect to watch them merge.'
        )}
      </p>
    </div>
  )
}
