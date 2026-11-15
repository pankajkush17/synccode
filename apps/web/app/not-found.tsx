import Link from 'next/link'
import { Logo } from '@/components/Logo'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-start justify-center gap-5 px-6">
      <Logo />
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        This room does not exist
      </h1>
      <p className="text-muted">
        The link may be mistyped, or the room was removed. Check the link with whoever shared it, or
        start a fresh room.
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover"
      >
        Start a new room
      </Link>
    </main>
  )
}
