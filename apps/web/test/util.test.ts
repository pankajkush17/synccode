import { ColorPalette, MessageType } from '@synccode/shared'
import { describe, expect, it } from 'vitest'
import {
  decodeFrame,
  decodeTimestamp,
  encodeFrame,
  encodeTimestamp,
} from '@/realtime/protocolCodec'
import { colorFor, isSafeColor, softColor } from '@/util/colorHash'
import { initials, randomName, sanitizeName } from '@/util/identity'
import { editTokenFromHash, isValidSlug, roomPath } from '@/util/slug'

describe('colorHash', () => {
  it('is a pure function of the seed', () => {
    expect(colorFor(12345)).toEqual(colorFor(12345))
    expect(ColorPalette.DEFAULT_COLORS).toContain(colorFor('anything').color)
  })

  it('derives soft colours and rejects unsafe ones', () => {
    expect(softColor('#8b7bff')).toBe('#8b7bff40')
    expect(softColor('red')).toBe('red')
    expect(isSafeColor('#8b7bff')).toBe(true)
    expect(isSafeColor('red; } body { display: none')).toBe(false)
    expect(isSafeColor(undefined)).toBe(false)
  })
})

describe('slug', () => {
  const token = 'a'.repeat(43)

  it('validates slugs', () => {
    expect(isValidSlug('abc123def4')).toBe(true)
    expect(isValidSlug('short')).toBe(false)
    expect(isValidSlug('ABC123DEF4')).toBe(false)
  })

  it('builds room paths with the token in the fragment only', () => {
    expect(roomPath('abc123def4')).toBe('/r/abc123def4')
    expect(roomPath('abc123def4', token)).toBe(`/r/abc123def4#t=${token}`)
  })

  it('reads a well-formed token from the fragment', () => {
    expect(editTokenFromHash(`#t=${token}`)).toBe(token)
    expect(editTokenFromHash(`#foo=1&t=${token}`)).toBe(token)
    expect(editTokenFromHash('')).toBeNull()
    expect(editTokenFromHash('#t=too-short')).toBeNull()
    expect(editTokenFromHash(`#t=${'!'.repeat(43)}`)).toBeNull()
  })
})

describe('identity', () => {
  it('builds initials from letters only', () => {
    expect(initials('Swift Otter')).toBe('SO')
    expect(initials('Jun (node B)')).toBe('JN')
    expect(initials('ada')).toBe('AD')
    expect(initials('  ')).toBe('?')
  })

  it('sanitises names', () => {
    expect(sanitizeName('  Ada   Lovelace  ')).toBe('Ada Lovelace')
    expect(sanitizeName('x'.repeat(100))).toHaveLength(24)
    expect(randomName()).toMatch(/^\w+ \w+$/)
  })
})

describe('protocolCodec', () => {
  it('mirrors the server frame layout', () => {
    const frame = encodeFrame(MessageType.UPDATE, 258, new Uint8Array([9]))
    expect(Array.from(frame)).toEqual([MessageType.UPDATE, 1, 2, 9])
    expect(decodeFrame(frame.buffer as ArrayBuffer)).toEqual({
      type: MessageType.UPDATE,
      roomRef: 258,
      payload: new Uint8Array([9]),
    })
  })

  it('round-trips ping timestamps', () => {
    expect(decodeTimestamp(encodeTimestamp(1234.5678))).toBe(1234.5678)
    expect(decodeTimestamp(new Uint8Array(3))).toBeNull()
  })
})
