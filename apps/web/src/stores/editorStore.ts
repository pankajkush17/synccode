import { DEFAULT_LANGUAGE, type LanguageId } from '@synccode/shared'
import { create } from 'zustand'

export interface CursorPosition {
  readonly line: number
  readonly column: number
}

type EditorStore = {
  language: LanguageId
  title: string | null
  cursor: CursorPosition | null
  setLanguage: (language: LanguageId) => void
  setTitle: (title: string | null) => void
  setCursor: (cursor: CursorPosition | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  language: DEFAULT_LANGUAGE,
  title: null,
  cursor: null,
  setLanguage: (language) => set({ language }),
  setTitle: (title) => set({ title }),
  setCursor: (cursor) => set({ cursor }),
}))
