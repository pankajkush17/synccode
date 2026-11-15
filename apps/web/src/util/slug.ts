import { EDIT_TOKEN_FRAGMENT_KEY, EDIT_TOKEN_PATTERN, SLUG_PATTERN } from '@synccode/shared'

/** Validation only — slugs are generated server-side. */
export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value)
}

export function roomPath(slug: string, editToken?: string | null): string {
  return editToken ? `/r/${slug}#${EDIT_TOKEN_FRAGMENT_KEY}=${editToken}` : `/r/${slug}`
}

/** Extracts a well-formed edit token from a URL fragment such as `#t=abc…`. */
export function editTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get(EDIT_TOKEN_FRAGMENT_KEY)
  return token && EDIT_TOKEN_PATTERN.test(token) ? token : null
}
