import { useEffect, useState } from 'react'
import { editTokenFromHash } from '@/util/slug'

export interface EditTokenState {
  /** False until the URL fragment has been read (it is not available during SSR). */
  readonly ready: boolean
  readonly token: string | null
}

/**
 * The edit token travels in the URL fragment (`#t=…`), which browsers never
 * send to a server — so it stays out of access logs and Referer headers.
 */
export function useEditToken(): EditTokenState {
  const [state, setState] = useState<EditTokenState>({ ready: false, token: null })

  useEffect(() => {
    const read = () => setState({ ready: true, token: editTokenFromHash(window.location.hash) })
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return state
}
