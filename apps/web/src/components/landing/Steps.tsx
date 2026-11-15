import { CONTAINER } from '@/components/layout'
import { cn } from '@/util/cn'

/** A real sequence: what a new visitor does, in order. */
const STEPS = [
  { title: 'Start a room', body: 'Pick a language and press the button. That is the whole setup.' },
  { title: 'Share the link', body: 'Copy it or show the QR code to whoever should join.' },
  { title: 'Code together', body: 'Everyone sees every keystroke and every cursor, live.' },
] as const

/** Always dark: one change of tone in the middle of an otherwise white page. */
export function Steps() {
  return (
    <section className="band-dark">
      <div className={cn(CONTAINER, 'py-20 lg:py-28')}>
        <p className="text-xs font-medium tracking-[0.08em] text-brand uppercase">How it goes</p>
        <h2 className="mt-4 max-w-xl text-3xl leading-tight font-medium tracking-[-0.03em] text-balance sm:text-[2.75rem]">
          From nothing to pairing in ten seconds
        </h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:mt-16">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-paper p-6 lg:p-8">
              <span className="text-xs font-medium tracking-[0.08em] text-muted uppercase">
                Step {index + 1}
              </span>
              <h3 className="mt-10 text-xl font-medium tracking-tight lg:mt-16">{step.title}</h3>
              <p className="mt-2 max-w-xs leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
