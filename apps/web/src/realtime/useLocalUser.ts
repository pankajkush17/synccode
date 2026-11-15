import { useCallback, useEffect, useState } from 'react'
import { loadName, sanitizeName, saveName } from '@/util/identity'

/** The visitor's display name: remembered across visits, editable at any time. */
export function useLocalUser(): { name: string | null; rename: (name: string) => void } {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    setName(loadName())
  }, [])

  const rename = useCallback((raw: string) => {
    const next = sanitizeName(raw)
    if (!next) return
    saveName(next)
    setName(next)
  }, [])

  return { name, rename }
}
