'use client'

import { DocKeys, type RoomMeta } from '@synccode/shared'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { DisconnectBanner } from '@/components/room/DisconnectBanner'
import { RemoteCursors } from '@/components/room/RemoteCursors'
import { StatusBar } from '@/components/room/StatusBar'
import { TopBar } from '@/components/room/TopBar'
import { ShareModal } from '@/components/share/ShareModal'
import { useThemeSync } from '@/components/ThemeToggle'
import { wsUrl } from '@/config/clientConfig'
import { useAwareness } from '@/realtime/useAwareness'
import { useConnection } from '@/realtime/useConnection'
import { useEditToken } from '@/realtime/useEditToken'
import { useLocalUser } from '@/realtime/useLocalUser'
import { useRoomSettings } from '@/realtime/useRoomSettings'
import { useYjsDoc } from '@/realtime/useYjsDoc'
import { useConnectionStore } from '@/stores/connectionStore'
import { useEditorStore } from '@/stores/editorStore'

function EditorSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted" role="status">
      {label}
    </div>
  )
}

// Monaco touches `window` at import time, so it can only load in the browser.
const EditorView = dynamic(() => import('@/editor/EditorView'), {
  ssr: false,
  loading: () => <EditorSkeleton label="Loading editor" />,
})

/** Client bootstrap for a room: document, presence, connection, then the editor. */
export function RoomClient({ room }: { room: RoomMeta }) {
  const { ready, token } = useEditToken()
  const { name, rename } = useLocalUser()
  const doc = useYjsDoc(room.slug)
  const awareness = useAwareness(doc, name)
  useConnection(ready ? wsUrl(room.slug, token) : null, doc, awareness)
  const settings = useRoomSettings(doc, room)

  const theme = useThemeSync()
  const language = useEditorStore((s) => s.language)
  const session = useConnectionStore((s) => s.session)
  const hasSynced = useConnectionStore((s) => s.hasSynced)
  const [shareOpen, setShareOpen] = useState(false)

  // Until the server confirms write access, the editor stays read-only.
  const canEdit = session?.permission === 'write'

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <TopBar
        canEdit={canEdit}
        onLanguageChange={settings.setLanguage}
        onTitleChange={settings.setTitle}
        onRename={rename}
        onShare={() => setShareOpen(true)}
      />
      <DisconnectBanner />

      <main
        className="min-h-0 flex-1 bg-surface"
        data-testid="editor-region"
        data-synced={hasSynced}
      >
        {doc && awareness && hasSynced ? (
          <EditorView
            yText={doc.getText(DocKeys.CONTENT)}
            awareness={awareness}
            language={language}
            readOnly={!canEdit}
            theme={theme}
          />
        ) : (
          <EditorSkeleton label="Joining room" />
        )}
      </main>

      <StatusBar />
      <RemoteCursors />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        slug={room.slug}
        editToken={canEdit ? token : null}
      />
    </div>
  )
}
