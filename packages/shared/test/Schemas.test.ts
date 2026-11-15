import { describe, expect, it } from 'vitest'
import {
  AuthAckSchema,
  ControlPayload,
  CreateRoomRequestSchema,
  isLanguageId,
  SlugSchema,
} from '../src'

describe('shared schemas', () => {
  it('round-trips control payloads', () => {
    const bytes = ControlPayload.encode(AuthAckSchema, { permission: 'write', nodeId: 'n1' })
    expect(ControlPayload.decode(AuthAckSchema, bytes)).toEqual({
      permission: 'write',
      nodeId: 'n1',
    })
  })

  it('rejects malformed control payloads', () => {
    const bytes = new TextEncoder().encode('{"permission":"admin","nodeId":"n1"}')
    expect(() => ControlPayload.decode(AuthAckSchema, bytes)).toThrow()
  })

  it('validates slugs and languages', () => {
    expect(SlugSchema.safeParse('abc123def4').success).toBe(true)
    expect(SlugSchema.safeParse('ABC123DEF4').success).toBe(false)
    expect(SlugSchema.safeParse('../etc').success).toBe(false)
    expect(isLanguageId('rust')).toBe(true)
    expect(isLanguageId('klingon')).toBe(false)
    expect(CreateRoomRequestSchema.safeParse({ language: 'klingon' }).success).toBe(false)
    expect(CreateRoomRequestSchema.safeParse({}).success).toBe(true)
  })
})
