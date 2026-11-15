'use client'

import { Check, Copy, Eye, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { roomPath } from '@/util/slug'
import { QrCode } from './QrCode'

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard blocked (insecure origin, denied permission): the field stays selectable.
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        aria-label={label}
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 font-mono text-xs text-ink"
        data-testid="share-url"
      />
      <Button variant="secondary" onClick={copy} className="w-28" data-testid="copy-link">
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}

function LinkPanel({ url, label, note }: { url: string; label: string; note: string }) {
  return (
    <div className="flex flex-col gap-4 pt-5">
      <p className="text-sm text-muted">{note}</p>
      <CopyLink url={url} label={label} />
      <div className="flex justify-center pt-1">
        <QrCode value={url} label={label} />
      </div>
    </div>
  )
}

export interface ShareModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly slug: string
  /** Present only when this visitor holds the edit link. */
  readonly editToken: string | null
}

/** Two links for one room: one that can edit, one that can only watch. */
export function ShareModal({ open, onOpenChange, slug, editToken }: ShareModalProps) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const viewUrl = `${origin}${roomPath(slug)}`
  const editUrl = editToken ? `${origin}${roomPath(slug, editToken)}` : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="share-modal">
        <DialogTitle>Share this room</DialogTitle>
        <DialogDescription>Anyone with a link can join. No account needed.</DialogDescription>

        <Tabs defaultValue={editUrl ? 'edit' : 'view'} className="mt-5">
          <TabsList>
            <TabsTrigger value="edit" disabled={!editUrl} data-testid="tab-edit">
              <Pencil />
              Can edit
            </TabsTrigger>
            <TabsTrigger value="view" data-testid="tab-view">
              <Eye />
              View only
            </TabsTrigger>
          </TabsList>

          {editUrl && (
            <TabsContent value="edit">
              <LinkPanel
                url={editUrl}
                label="Edit link"
                note="People with this link can change the code. Share it only with collaborators."
              />
            </TabsContent>
          )}
          <TabsContent value="view">
            <LinkPanel
              url={viewUrl}
              label="View-only link"
              note={
                editUrl
                  ? 'People with this link can watch live but cannot change anything.'
                  : 'You joined with a view-only link, so this is the only link you can share.'
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
