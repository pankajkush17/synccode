'use client'

import { DEFAULT_LANGUAGE, isLanguageId, LANGUAGES, type LanguageId } from '@synccode/shared'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
import { cn } from '@/util/cn'
import { useStartRoom } from './useStartRoom'

/** Pick a language, start a room, land in it holding the edit link. */
export function StartRoomForm({
  testId = 'start-room',
  centered = false,
  children,
}: {
  testId?: string
  centered?: boolean
  /** Extra actions shown on the same row as the button. */
  children?: ReactNode
}) {
  const [language, setLanguage] = useState<LanguageId>(DEFAULT_LANGUAGE)
  const { start, pending, error } = useStartRoom()

  return (
    <div className={cn('flex flex-col gap-3', centered && 'items-center text-center')}>
      <div className={cn('flex flex-wrap items-center gap-3', centered && 'justify-center')}>
        <Select
          value={language}
          onValueChange={(v) => isLanguageId(v) && setLanguage(v)}
          disabled={pending}
        >
          <SelectTrigger aria-label="Language" className="h-11 w-40 rounded-lg px-3.5 text-[15px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="lg"
          onClick={() => start(language)}
          disabled={pending}
          className="rounded-xl"
          data-testid={testId}
        >
          {pending ? 'Starting room' : 'Start a room'}
        </Button>
        {children}
      </div>
      <p className="text-sm text-muted" role={error ? 'alert' : undefined}>
        {error ? <span className="text-danger">{error}</span> : 'No account. The link is the key.'}
      </p>
    </div>
  )
}
