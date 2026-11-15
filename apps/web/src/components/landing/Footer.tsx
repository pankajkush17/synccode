import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { CONTAINER } from '@/components/layout'
import { cn } from '@/util/cn'

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={cn(CONTAINER, 'flex flex-wrap items-center justify-between gap-4 py-8')}>
        <Logo />
        <nav className="flex gap-8 text-sm" aria-label="Footer">
          <Link href="/" className="text-muted hover:text-ink">
            Start a room
          </Link>
          <Link href="/engineering" className="text-muted hover:text-ink">
            Engineering
          </Link>
        </nav>
      </div>
    </footer>
  )
}
