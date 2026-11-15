import {
  DocKeys,
  isLanguageId,
  type LanguageId,
  type RoomMeta,
  TITLE_MAX_LENGTH,
} from '@synccode/shared'
import { useCallback, useEffect } from 'react'
import type * as Y from 'yjs'
import { useEditorStore } from '@/stores/editorStore'

export interface RoomSettingsActions {
  setLanguage(language: LanguageId): void
  setTitle(title: string): void
}

/**
 * Language and title live in a shared Y.Map, so changing either is just another
 * CRDT update: it syncs to every peer and persists exactly like text does.
 * Until someone changes them, the values stored on the room row apply.
 */
export function useRoomSettings(doc: Y.Doc | null, initial: RoomMeta): RoomSettingsActions {
  const { language: initialLanguage, title: initialTitle } = initial

  useEffect(() => {
    const { setLanguage, setTitle } = useEditorStore.getState()
    setLanguage(initialLanguage)
    setTitle(initialTitle)
    if (!doc) return

    const meta = doc.getMap(DocKeys.META)
    const read = () => {
      const language = meta.get(DocKeys.META_LANGUAGE)
      const title = meta.get(DocKeys.META_TITLE)
      setLanguage(isLanguageId(language) ? language : initialLanguage)
      setTitle(typeof title === 'string' ? title.slice(0, TITLE_MAX_LENGTH) || null : initialTitle)
    }
    read()
    meta.observe(read)
    return () => meta.unobserve(read)
  }, [doc, initialLanguage, initialTitle])

  const setLanguage = useCallback(
    (language: LanguageId) => doc?.getMap(DocKeys.META).set(DocKeys.META_LANGUAGE, language),
    [doc],
  )
  const setTitle = useCallback(
    (title: string) =>
      doc?.getMap(DocKeys.META).set(DocKeys.META_TITLE, title.trim().slice(0, TITLE_MAX_LENGTH)),
    [doc],
  )

  return { setLanguage, setTitle }
}
