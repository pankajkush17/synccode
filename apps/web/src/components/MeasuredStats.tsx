import { cn } from '@/util/cn'

/** Measured on a laptop: two sync nodes, 50 headless clients, 2 edits per second each for 10 s. */
const MEASURED = [
  { value: '1.7 ms', label: 'median time for an edit to reach every other person' },
  { value: '4.4 ms', label: '95th percentile, across two servers and Redis' },
  { value: '48,853 / 48,853', label: 'deliveries observed; every copy identical at the end' },
  { value: '< 200 bytes', label: 'to catch up someone who dropped off a 20 KB document' },
] as const

export function MeasuredStats({ className }: { className?: string }) {
  return (
    <div className={className}>
      <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {MEASURED.map((item) => (
          <div key={item.label} className="bg-surface p-5 lg:p-6">
            <dt className="font-display text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
              {item.value}
            </dt>
            <dd className="mt-1.5 text-sm leading-snug text-muted">{item.label}</dd>
          </div>
        ))}
      </dl>
      <p className={cn('mt-3 text-xs text-muted')}>
        Measured locally: 50 headless clients split across two sync nodes, 2 edits per second each
        for 10 seconds. Reproduce with{' '}
        <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-ink">pnpm load-test</code>.
      </p>
    </div>
  )
}
