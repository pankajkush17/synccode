'use client'

import { isLanguageId, LANGUAGES, type LanguageId, TITLE_MAX_LENGTH } from '@synccode/shared'
import { Share2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
import { useEditorStore } from '@/stores/editorStore'
import { PeerAvatars } from './PeerAvatars'

function TitleField({
  canEdit,
  onChange,
}: {
  canEdit: boolean
  onChange: (title: string) => void
}) {
  const title = useEditorStore((s) => s.title)
  const [draft, setDraft] = useState(title ?? '')
  const [editing, setEditing] = useState(false)

  // Follow remote renames, but never overwrite what this user is typing.
  useEffect(() => {
    if (!editing) setDraft(title ?? '')
  }, [title, editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== (title ?? '')) onChange(next)
  }

  if (!canEdit) {
    return <span className="truncate text-sm font-medium">{title || 'Untitled room'}</span>
  }

  return (
    <input
      aria-label="Room title"
      value={draft}
      placeholder="Untitled room"
      maxLength={TITLE_MAX_LENGTH}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(title ?? '')
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
      className="h-8 w-full min-w-0 max-w-xs truncate rounded-lg border border-transparent bg-transparent px-2 text-sm font-medium placeholder:text-muted hover:border-line focus:border-line focus:bg-paper"
    />
  )
}

function LanguagePicker({
  canEdit,
  onChange,
}: {
  canEdit: boolean
  onChange: (language: LanguageId) => void
}) {
  const language = useEditorStore((s) => s.language)
  return (
    <Select
      value={language}
      onValueChange={(value) => isLanguageId(value) && onChange(value)}
      disabled={!canEdit}
    >
      <SelectTrigger aria-label="Language" className="w-36" data-testid="language-picker">
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
  )
}

export interface TopBarProps {
  readonly canEdit: boolean
  readonly onLanguageChange: (language: LanguageId) => void
  readonly onTitleChange: (title: string) => void
  readonly onRename: (name: string) => void
  readonly onShare: () => void
}

/** Title, language picker, who is here, and the share button. */
export function TopBar({
  canEdit,
  onLanguageChange,
  onTitleChange,
  onRename,
  onShare,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <Link href="/" aria-label="SyncCode home" className="shrink-0 rounded-lg p-1 text-ink">
        <LogoMark className="size-7" />
      </Link>

      <div className="hidden min-w-0 flex-1 sm:block">
        <TitleField canEdit={canEdit} onChange={onTitleChange} />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <LanguagePicker canEdit={canEdit} onChange={onLanguageChange} />
        <PeerAvatars onRename={onRename} />
        <ThemeToggle />
        <Button size="sm" onClick={onShare} aria-label="Share this room" data-testid="share-button">
          <Share2 />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </header>
  )
}
