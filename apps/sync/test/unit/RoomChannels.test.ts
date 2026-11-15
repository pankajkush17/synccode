import { describe, expect, it } from 'vitest'
import { RoomChannels } from '../../src/pubsub/RoomChannels'

describe('RoomChannels', () => {
  it('builds and parses channel names', () => {
    expect(RoomChannels.updates('abcdefghij')).toBe('room:abcdefghij:updates')
    expect(RoomChannels.awareness('abcdefghij')).toBe('room:abcdefghij:awareness')
    expect(RoomChannels.all('abcdefghij')).toHaveLength(2)
    expect(RoomChannels.parse('room:abcdefghij:updates')).toEqual({
      slug: 'abcdefghij',
      topic: 'updates',
    })
  })

  it('routes envelope kinds to channels', () => {
    expect(RoomChannels.forKind('abcdefghij', 'update')).toBe('room:abcdefghij:updates')
    expect(RoomChannels.forKind('abcdefghij', 'sync-request')).toBe('room:abcdefghij:updates')
    expect(RoomChannels.forKind('abcdefghij', 'awareness')).toBe('room:abcdefghij:awareness')
  })

  it('rejects foreign channels', () => {
    for (const bad of [
      '',
      'room',
      'user:abcdefghij:updates',
      'room:BAD:updates',
      'room:abcdefghij:nope',
      'room:abcdefghij:updates:x',
    ]) {
      expect(RoomChannels.parse(bad)).toBeNull()
    }
  })
})
