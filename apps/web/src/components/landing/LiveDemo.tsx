'use client'

import { useReducedMotion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CodeLine } from '@/components/CodeLine'
import { cn } from '@/util/cn'

/**
 * A scripted replay of what the product does: two people typing into one file
 * at once. Each author owns a block of lines and has a caret with a name flag,
 * exactly as remote cursors look in the real editor.
 */
const AUTHORS = [
  {
    name: 'Mira',
    color: '#8b7bff',
    startTick: 0,
    lines: [
      'function mergeIntervals(list: Interval[]) {',
      '  const sorted = [...list].sort(byStart)',
      '  return sorted.reduce(collapse, [])',
      '}',
    ],
  },
  {
    name: 'Jun',
    color: '#ff7a90',
    startTick: 14,
    lines: [
      '// touching ranges should merge too',
      "test('merges [1,3] and [3,5]', () => {",
      '  expect(mergeIntervals(input)).toEqual([[1, 5]])',
      '})',
    ],
  },
] as const

const TICK_MS = 38
const length = (lines: readonly string[]) => lines.reduce((n, line) => n + line.length + 1, 0)
const TOTAL_TICKS = Math.max(...AUTHORS.map((a) => a.startTick + length(a.lines)))

function Caret({ name, color, blinking }: { name: string; color: string; blinking: boolean }) {
  return (
    <span className="relative inline-block h-[1.25em] w-0 align-text-bottom" aria-hidden="true">
      <span
        className={cn('absolute inset-y-0 -left-px w-0.5 rounded-full', blinking && 'caret-blink')}
        style={{ backgroundColor: color }}
      />
      <span
        className="absolute top-1/2 left-1.5 -translate-y-1/2 rounded px-1.5 py-px font-sans text-[10px] leading-snug font-semibold whitespace-nowrap text-[#14152b]"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </span>
  )
}

export function LiveDemo() {
  const reduceMotion = useReducedMotion()
  const [tick, setTick] = useState(0)
  const done = reduceMotion || tick >= TOTAL_TICKS

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the timer when a replay resets the tick to 0
  useEffect(() => {
    if (reduceMotion || tick >= TOTAL_TICKS) return
    const timer = setInterval(() => setTick((t) => Math.min(t + 1, TOTAL_TICKS)), TICK_MS)
    return () => clearInterval(timer)
  }, [reduceMotion, tick >= TOTAL_TICKS])

  let lineNumber = 0
  return (
    <figure
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      aria-label="Demo: Mira and Jun typing into the same file at the same time"
    >
      <div className="flex h-12 items-center gap-3 border-b border-line px-4 text-sm xl:px-6">
        <span className="font-mono text-xs text-ink">intervals.ts</span>
        <span className="ml-auto flex -space-x-1.5">
          {AUTHORS.map((author) => (
            <span
              key={author.name}
              className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-[#14152b] ring-2 ring-surface"
              style={{ backgroundColor: author.color }}
            >
              {author.name[0]}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setTick(0)}
          disabled={!done || !!reduceMotion}
          aria-label="Replay the demo"
          className="rounded-md p-1 text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-0"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      <div
        className="overflow-x-auto px-4 pt-7 pb-5 font-mono text-[11.5px] leading-[1.9] sm:text-[13px] xl:text-[13.5px]"
        aria-hidden="true"
      >
        {AUTHORS.map((author, block) => {
          const started = done || tick >= author.startTick
          // Characters this author has typed so far; a line break counts as one keystroke.
          let remaining = done ? length(author.lines) : Math.max(0, tick - author.startTick)
          return (
            <div key={author.name} className={block > 0 ? 'mt-[1.9em]' : undefined}>
              {author.lines.map((line, index) => {
                const typed = Math.min(line.length, remaining)
                const isLast = index === author.lines.length - 1
                // The caret sits on the line being typed, or rests on the last line when finished.
                const caretHere = started && (remaining <= line.length || isLast) && remaining >= 0
                remaining = caretHere ? -1 : remaining - line.length - 1
                lineNumber++
                return (
                  <div key={line} className="flex whitespace-pre">
                    <span className="w-7 shrink-0 text-right text-muted/60 select-none">
                      {lineNumber}
                    </span>
                    <span className="pl-4">
                      <CodeLine text={line.slice(0, Math.max(0, typed))} />
                      {caretHere && (
                        <Caret name={author.name} color={author.color} blinking={done} />
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <figcaption className="flex h-8 items-center gap-4 border-t border-line px-4 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-ok" />
          <span className="font-medium text-ink">Connected</span>
        </span>
        <span>2 people here</span>
        <span className="ml-auto hidden sm:inline">TypeScript</span>
      </figcaption>
    </figure>
  )
}
