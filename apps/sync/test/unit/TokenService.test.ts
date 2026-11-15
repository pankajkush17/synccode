import { EDIT_TOKEN_PATTERN } from '@synccode/shared'
import { describe, expect, it } from 'vitest'
import { TokenService } from '../../src/auth/TokenService'

describe('TokenService', () => {
  const service = new TokenService(Buffer.alloc(32, 7))

  it('mints a URL-safe token that verifies against its hash', () => {
    const { token, tokenHash } = service.mintEditToken('abcdefghij')
    expect(token).toMatch(EDIT_TOKEN_PATTERN)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(service.verifyEditToken('abcdefghij', token, tokenHash)).toBe(true)
  })

  it('mints a different token every time', () => {
    const a = service.mintEditToken('abcdefghij')
    const b = service.mintEditToken('abcdefghij')
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })

  it('binds a token to its room', () => {
    const { token, tokenHash } = service.mintEditToken('abcdefghij')
    expect(service.verifyEditToken('zzzzzzzzzz', token, tokenHash)).toBe(false)
  })

  it('rejects tampered, malformed and foreign tokens', () => {
    const { token, tokenHash } = service.mintEditToken('abcdefghij')
    const flipped = (token[0] === 'A' ? 'B' : 'A') + token.slice(1)
    expect(service.verifyEditToken('abcdefghij', flipped, tokenHash)).toBe(false)
    expect(service.verifyEditToken('abcdefghij', '', tokenHash)).toBe(false)
    expect(service.verifyEditToken('abcdefghij', 'short', tokenHash)).toBe(false)
    expect(service.verifyEditToken('abcdefghij', token, 'not-hex')).toBe(false)
    expect(service.verifyEditToken('abcdefghij', token, '')).toBe(false)
  })

  it('does not verify hashes made with a different server secret', () => {
    const other = new TokenService(Buffer.alloc(32, 9))
    const { token, tokenHash } = other.mintEditToken('abcdefghij')
    expect(service.verifyEditToken('abcdefghij', token, tokenHash)).toBe(false)
  })

  it('refuses a weak secret', () => {
    expect(() => new TokenService(Buffer.alloc(8))).toThrow()
  })
})
