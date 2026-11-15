'use client'

import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-start justify-center gap-5 px-6">
      <Logo />
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        The sync server is not responding
      </h1>
      <p className="text-muted">
        The page could not reach the server that holds this room. Your document is safe. Try again
        in a moment.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
