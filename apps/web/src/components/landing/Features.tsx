import { LANGUAGES } from '@synccode/shared'
import { Check, Eye, Pencil, Wifi, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { CONTAINER } from '@/components/layout'
import { cn } from '@/util/cn'

const MIRA = '#8b7bff'
const JUN = '#ff7a90'
const SAM = '#2fd3b8'

/** Every cell has the same anatomy — a fixed-height picture, a title, one sentence — so the grid lines up. */
function Tile({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <article className="flex flex-col bg-paper p-6 lg:p-8">
      <div className="flex h-40 items-center justify-center rounded-xl bg-raised px-5">
        {children}
      </div>
      <h3 className="mt-6 text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 leading-relaxed text-muted">{body}</p>
    </article>
  )
}

function Flag({ name, color }: { name: string; color: string }) {
  return (
    <span className="relative inline-block h-[1.3em] w-0 align-text-bottom">
      <span
        className="absolute inset-y-0 -left-px w-0.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span
        className="absolute bottom-full -left-px rounded rounded-bl-none px-1.5 py-px font-sans text-[10px] leading-snug font-semibold whitespace-nowrap text-[#14152b]"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </span>
  )
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full max-w-xs rounded-xl border border-line bg-paper p-4', className)}>
      {children}
    </div>
  )
}

function TogetherVisual() {
  return (
    <Panel className="font-mono text-[13px] leading-[2.5] whitespace-pre">
      <div>
        <span className="text-brand">const</span> total = price
        <Flag name="Mira" color={MIRA} />
      </div>
      <div>
        <span className="text-brand">return</span> total * qty
        <Flag name="Jun" color={JUN} />
      </div>
    </Panel>
  )
}

function PresenceVisual() {
  const people = [
    ['MK', 'Mira', MIRA],
    ['JP', 'Jun', JUN],
    ['SA', 'Sam', SAM],
  ] as const
  return (
    <Panel className="flex flex-col gap-2.5">
      {people.map(([initials, name, color]) => (
        <div key={name} className="flex items-center gap-3 text-sm">
          <span
            className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-[#14152b]"
            style={{ backgroundColor: color }}
          >
            {initials}
          </span>
          <span className="font-medium">{name}</span>
          <span className="ml-auto size-2 rounded-full bg-ok" />
        </div>
      ))}
    </Panel>
  )
}

function LinksVisual() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2 text-sm font-medium">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
        <Pencil className="size-4 text-brand" />
        Can edit
        <span className="ml-auto text-xs font-normal text-muted">for collaborators</span>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
        <Eye className="size-4 text-muted" />
        View only
        <span className="ml-auto text-xs font-normal text-muted">for everyone else</span>
      </div>
    </div>
  )
}

function OfflineVisual() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2 text-sm font-medium">
      <div className="flex items-center gap-2.5 rounded-xl bg-warn-bg px-4 py-3 text-warn-ink">
        <WifiOff className="size-4 shrink-0" />
        Connection lost. Keep typing.
      </div>
      <div className="flex items-center gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-brand">
        <Wifi className="size-4 shrink-0" />
        Back online. All caught up.
      </div>
    </div>
  )
}

function LanguagesVisual() {
  return (
    <ul className="flex max-w-xs flex-wrap justify-center gap-1.5">
      {LANGUAGES.slice(0, 10).map((language) => (
        <li
          key={language.id}
          className="rounded-md border border-line bg-paper px-2.5 py-1 text-sm"
        >
          {language.label}
        </li>
      ))}
    </ul>
  )
}

function SavedVisual() {
  return (
    <Panel className="flex items-center gap-3 text-sm">
      <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-brand">
        <Check className="size-5" />
      </span>
      <span>
        <span className="block font-medium">Saved</span>
        <span className="block text-muted">a moment ago</span>
      </span>
    </Panel>
  )
}

export function Features() {
  return (
    <section className="border-t border-line">
      <div className={cn(CONTAINER, 'py-20 lg:py-28')}>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="text-xs font-medium tracking-[0.08em] text-brand uppercase">
              What you get
            </p>
            <h2 className="mt-4 max-w-md text-3xl leading-tight font-medium tracking-[-0.03em] text-balance sm:text-[2.75rem]">
              Everything you need to pair, and nothing else
            </h2>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-muted lg:justify-self-end">
            Built for interviews, pairing sessions and quick “can you look at this?” moments.
          </p>
        </div>

        {/* Hairlines instead of cards: the 1px gaps let the border colour show through. */}
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          <Tile
            title="Type at the same time"
            body="Everyone edits the same file at once, even the same line. Nobody gets locked out and nothing is overwritten."
          >
            <TogetherVisual />
          </Tile>
          <Tile
            title="See who is here"
            body="Each person gets a colour, a name and a live cursor, so you always know who is doing what."
          >
            <PresenceVisual />
          </Tile>
          <Tile
            title="Share with a link"
            body="One link lets people edit, another lets them just watch. Send whichever fits."
          >
            <LinksVisual />
          </Tile>
          <Tile
            title="Works through bad wifi"
            body="Lose your connection and keep typing. Your changes join everyone else’s when you are back."
          >
            <OfflineVisual />
          </Tile>
          <Tile
            title="Your language, highlighted"
            body="TypeScript, Python, Go, Rust, SQL and more, with the same editor that powers VS Code."
          >
            <LanguagesVisual />
          </Tile>
          <Tile
            title="Saved as you type"
            body="Close the tab and come back later. The room and everything in it will still be there."
          >
            <SavedVisual />
          </Tile>
        </div>
      </div>
    </section>
  )
}
