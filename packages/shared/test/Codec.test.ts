import { describe, expect, it } from 'vitest'
import { Codec, FrameDecodeError, MessageType } from '../src'

describe('Codec', () => {
  const codec = new Codec()

  it('round-trips type, roomRef and payload', () => {
    const payload = new Uint8Array([1, 2, 3, 250])
    const frame = codec.encode(MessageType.UPDATE, 0x1234, payload)
    expect(frame.byteLength).toBe(Codec.HEADER_BYTES + 4)
    expect(Array.from(frame.subarray(0, 3))).toEqual([MessageType.UPDATE, 0x12, 0x34])
    expect(codec.decode(frame)).toEqual({ type: MessageType.UPDATE, roomRef: 0x1234, payload })
  })

  it('supports empty payloads and boundary roomRefs', () => {
    for (const ref of [0, 1, 0xffff]) {
      const decoded = codec.decode(codec.encode(MessageType.PING, ref))
      expect(decoded.roomRef).toBe(ref)
      expect(decoded.payload.byteLength).toBe(0)
    }
  })

  it('rejects out-of-range roomRefs', () => {
    expect(() => codec.encode(MessageType.PING, -1)).toThrow(RangeError)
    expect(() => codec.encode(MessageType.PING, 0x10000)).toThrow(RangeError)
    expect(() => codec.encode(MessageType.PING, 1.5)).toThrow(RangeError)
  })

  it('rejects short frames and unknown types', () => {
    expect(() => codec.decode(new Uint8Array([0, 0]))).toThrow(FrameDecodeError)
    expect(() => codec.decode(new Uint8Array([99, 0, 0]))).toThrow(FrameDecodeError)
  })

  it('decodes a view into a larger buffer correctly', () => {
    const backing = new Uint8Array([9, 9, MessageType.AWARENESS, 0, 7, 42, 43])
    const decoded = codec.decode(backing.subarray(2))
    expect(decoded).toEqual({
      type: MessageType.AWARENESS,
      roomRef: 7,
      payload: new Uint8Array([42, 43]),
    })
  })
})
