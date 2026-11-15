import { CONTAINER } from '@/components/layout'
import { cn } from '@/util/cn'
import { StartRoomForm } from './StartRoomForm'

export function FinalCta() {
  return (
    <section className={cn(CONTAINER, 'py-20 lg:py-28')}>
      <div className="peer-backdrop rounded-3xl p-3 sm:p-4">
        <div className="flex flex-col items-center rounded-[1.25rem] bg-paper px-6 py-16 text-center lg:py-24">
          <h2 className="max-w-2xl text-4xl leading-[1.08] font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            Your room is one click away
          </h2>
          <p className="mt-4 max-w-md text-lg text-muted">
            Start one now and send the link to someone.
          </p>
          <div className="mt-9">
            <StartRoomForm testId="start-room-bottom" centered />
          </div>
        </div>
      </div>
    </section>
  )
}
