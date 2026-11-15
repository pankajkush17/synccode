import { useEffect, useState } from 'react'
import * as Y from 'yjs'

/**
 * Owns the local Y.Doc for a room. The document is created inside the effect
 * (not during render) so React's StrictMode double-mount gets a fresh, live
 * document each time instead of one that was already destroyed.
 */
export function useYjsDoc(slug: string): Y.Doc | null {
  const [doc, setDoc] = useState<Y.Doc | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new room means a new document
  useEffect(() => {
    const next = new Y.Doc()
    setDoc(next)
    return () => {
      setDoc(null)
      next.destroy()
    }
  }, [slug])

  return doc
}
