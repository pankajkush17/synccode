import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CONTAINER } from '@/components/layout'
import { cn } from '@/util/cn'
import { LiveDemo } from './LiveDemo'
import { StartRoomForm } from './StartRoomForm'

export function Hero() {
  return (
    <section id="start" className="scroll-mt-14">
      <div
        className={cn(
          CONTAINER,
          'grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-24',
        )}
      >
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-brand uppercase">
            No account. Nothing to install.
          </p>
          <h1 className="mt-5 text-[clamp(2.5rem,4.8vw,4.25rem)] leading-[1.06] font-medium tracking-[-0.035em] text-balance">
            Write code together, in the same file, at the same moment.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Open a room, send the link, and everyone types into one document with live cursors.
          </p>
          <div className="mt-9">
            <StartRoomForm>
              <Link
                href="/engineering"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-[15px] font-medium hover:bg-raised"
              >
                How it works
                <ArrowRight className="size-4" />
              </Link>
            </StartRoomForm>
          </div>
        </div>

        {/* The product shot, framed on a backdrop made of the collaborator colours. */}
        <div className="peer-backdrop rounded-3xl p-4 sm:p-8 lg:p-10">
          <LiveDemo />
        </div>
      </div>
    </section>
  )
}
