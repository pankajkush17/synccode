/**
 * Types only — signing and verifying stay server-side (apps/sync TokenService).
 *
 * An edit token is `base64url(HMAC-SHA256(roomSecret, 'edit:' + slug))`: 32 bytes → 43 chars.
 */
export type EditToken = string

export interface MintedEditToken {
  /** Handed to the room creator exactly once; travels only in the URL fragment. */
  readonly token: EditToken
  /** What Postgres stores. The token cannot be derived from it. */
  readonly tokenHash: string
}

export const EDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
/** URL fragment key: `/r/<slug>#t=<token>` */
export const EDIT_TOKEN_FRAGMENT_KEY = 't'
/** Query key on the WebSocket URL. */
export const EDIT_TOKEN_QUERY_KEY = 't'
