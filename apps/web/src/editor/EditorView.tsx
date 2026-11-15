'use client'

import type { LanguageId } from '@synccode/shared'
import type { editor } from 'monaco-editor'
import { useEffect, useMemo } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import { useEditorStore } from '@/stores/editorStore'
import type { Theme } from '@/stores/themeStore'
import { useMonacoEditor } from './useMonacoEditor'
import { useYMonacoBridge } from './useYMonacoBridge'

const BASE_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontFamily: 'var(--font-code), ui-monospace, Menlo, monospace',
  fontSize: 14,
  lineHeight: 22,
  fontLigatures: true,
  minimap: { enabled: false },
  padding: { top: 20, bottom: 20 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'line',
  roundedSelection: true,
  tabSize: 2,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  stickyScroll: { enabled: false },
  guides: { indentation: true },
  bracketPairColorization: { enabled: true },
}

export interface EditorViewProps {
  readonly yText: Y.Text
  readonly awareness: Awareness
  readonly language: LanguageId
  readonly readOnly: boolean
  readonly theme: Theme
}

/** Monaco, bound to the shared document. Client-only: load it with `ssr: false`. */
export default function EditorView({
  yText,
  awareness,
  language,
  readOnly,
  theme,
}: EditorViewProps) {
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ...BASE_OPTIONS,
      readOnly,
      domReadOnly: readOnly,
      readOnlyMessage: { value: 'This link is view only. Ask for an edit link to make changes.' },
      placeholder: readOnly
        ? 'Nothing here yet. Edits will appear as they are typed.'
        : 'Start typing. Everyone with the link sees it as you write.',
    }),
    [readOnly],
  )

  const { containerRef, instance } = useMonacoEditor({ language, dark: theme === 'dark', options })
  useYMonacoBridge(instance, yText, awareness)

  // Report the caret position to the status bar.
  const setCursor = useEditorStore((s) => s.setCursor)
  useEffect(() => {
    if (!instance) return
    const report = () => {
      const position = instance.getPosition()
      setCursor(position ? { line: position.lineNumber, column: position.column } : null)
    }
    report()
    const subscription = instance.onDidChangeCursorPosition(report)
    return () => {
      subscription.dispose()
      setCursor(null)
    }
  }, [instance, setCursor])

  useEffect(() => {
    if (instance && !readOnly) instance.focus()
  }, [instance, readOnly])

  return <div ref={containerRef} className="h-full w-full" data-testid="editor" />
}
