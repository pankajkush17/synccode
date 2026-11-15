import type { editor } from 'monaco-editor'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { DARK_THEME, LIGHT_THEME, setupMonaco } from './monacoSetup'

export interface MonacoEditorConfig {
  readonly language: string
  readonly dark: boolean
  readonly options: editor.IStandaloneEditorConstructionOptions
}

export interface MonacoEditorHandle {
  /** Attach to the element that should host the editor. */
  readonly containerRef: RefObject<HTMLDivElement | null>
  /** The live editor, or `null` before mount and after unmount. */
  readonly instance: editor.IStandaloneCodeEditor | null
}

/**
 * Owns one Monaco editor and its model for the lifetime of the component.
 *
 * Creation and disposal are a matched pair inside a single effect, so React
 * re-running effects (StrictMode, Fast Refresh) always leaves exactly one live
 * editor. Language, theme and options are applied to the existing editor rather
 * than recreating it, which keeps cursor, scroll position and undo history.
 */
export function useMonacoEditor({
  language,
  dark,
  options,
}: MonacoEditorConfig): MonacoEditorHandle {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null)
  // Read at creation time only; later changes flow through the effects below.
  const initial = useRef({ language, dark, options })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const monaco = setupMonaco()
    const model = monaco.editor.createModel('', initial.current.language)
    const created = monaco.editor.create(container, {
      ...initial.current.options,
      model,
      theme: initial.current.dark ? DARK_THEME : LIGHT_THEME,
    })
    setInstance(created)

    return () => {
      setInstance(null)
      created.dispose()
      model.dispose()
    }
  }, [])

  useEffect(() => {
    const model = instance?.getModel()
    if (model) setupMonaco().editor.setModelLanguage(model, language)
  }, [instance, language])

  useEffect(() => {
    if (instance) setupMonaco().editor.setTheme(dark ? DARK_THEME : LIGHT_THEME)
  }, [instance, dark])

  useEffect(() => {
    instance?.updateOptions(options)
  }, [instance, options])

  return { containerRef, instance }
}
