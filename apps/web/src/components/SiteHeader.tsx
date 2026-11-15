import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { CONTAINER } from '@/components/layout'
import { StartRoomButton } from '@/components/StartRoomButton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/util/cn'

export function SiteHeader({ current }: { current: 'home' | 'engineering' }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className={cn(CONTAINER, 'flex h-14 items-center justify-between')}>
        <Link href="/" aria-label="SyncCode home" className="rounded-lg">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/engineering"
            aria-current={current === 'engineering' ? 'page' : undefined}
            className="rounded-md px-3 py-1.5 text-muted hover:text-ink aria-[current=page]:text-ink"
          >
            Engineering
          </Link>
          <ThemeToggle />
          <StartRoomButton />
        </nav>
      </div>
    </header>
  )
}
