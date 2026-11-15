import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { EDIT_TOKEN_PATTERN, type MintedEditToken } from '@synccode/shared'

/**
 * HMAC capability tokens for share links — authorisation without a user model.
 *
 *   roomSecret = 32 random bytes                      (never stored, never leaves this method)
 *   token      = base64url(HMAC(roomSecret, 'edit:' + slug))   → given to the creator once
 *   tokenHash  = hex(HMAC(serverSecret, slug + ':' + token))   → stored in Postgres
 *
 * Possessing the token *is* the permission. The database only ever holds the
 * keyed hash, so a leaked table cannot be turned back into working edit links
 * without also stealing the server secret.
 */
export class TokenService {
  private static readonly ROOM_SECRET_BYTES = 32
  private static readonly ALGORITHM = 'sha256'

  constructor(private readonly secret: Buffer) {
    if (secret.byteLength < 32) throw new Error('TokenService secret must be at least 32 bytes')
  }

  mintEditToken(slug: string): MintedEditToken {
    const roomSecret = randomBytes(TokenService.ROOM_SECRET_BYTES)
    const token = createHmac(TokenService.ALGORITHM, roomSecret)
      .update(`edit:${slug}`)
      .digest('base64url')
    return { token, tokenHash: this.hash(slug, token) }
  }

  verifyEditToken(slug: string, token: string, tokenHash: string): boolean {
    if (!EDIT_TOKEN_PATTERN.test(token)) return false
    const expected = Buffer.from(tokenHash, 'hex')
    const actual = Buffer.from(this.hash(slug, token), 'hex')
    // timingSafeEqual throws on length mismatch, so guard first.
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual)
  }

  private hash(slug: string, token: string): string {
    return createHmac(TokenService.ALGORITHM, this.secret).update(`${slug}:${token}`).digest('hex')
  }
}
