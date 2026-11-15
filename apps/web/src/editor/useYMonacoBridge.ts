import type { editor } from 'monaco-editor'
import { useEffect } from 'react'
import { MonacoBinding } from 'y-monaco'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'

/**
 * Wires a Y.Text to a Monaco model through y-monaco: local keystrokes become Y
 * operations, remote operations become model edits, and selections travel
 * through awareness.
 *
 * The binding lives in an effect keyed on the editor, the text and awareness,
 * so it is torn down and rebuilt whenever any of them is replaced.
 */
export function useYMonacoBridge(
  instance: editor.IStandaloneCodeEditor | null,
  yText: Y.Text,
  awareness: Awareness,
): void {
  useEffect(() => {
    const model = instance?.getModel()
    if (!instance || !model) return
    const binding = new MonacoBinding(yText, model, new Set([instance]), awareness)
    return () => {
      // Disposing the model already destroys the binding (y-monaco listens for it).
      if (!model.isDisposed()) binding.destroy()
    }
  }, [instance, yText, awareness])
}
