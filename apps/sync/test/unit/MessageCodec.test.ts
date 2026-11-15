import { MessageType } from '@synccode/shared'
import { describe, expect, it } from 'vitest'
import { ProtocolError } from '../../src/errors'
import { MessageCodec } from '../../src/ws/MessageCodec'

describe('MessageCodec', () => {
  const codec = new MessageCodec()

  it('round-trips a frame', () => {
    const payload = new Uint8Array([7, 8, 9])
    const decoded = codec.decode(codec.encode(MessageType.SYNC_STEP_2, 513, payload))
    expect(decoded).toEqual({ type: MessageType.SYNC_STEP_2, roomRef: 513, payload })
  })

  it('accepts Node buffers', () => {
    const frame = Buffer.from(codec.encode(MessageType.UPDATE, 1, new Uint8Array([1])))
    expect(Array.from(codec.decode(frame).payload)).toEqual([1])
  })

  it('maps malformed frames to ProtocolError', () => {
    expect(() => codec.decode(new Uint8Array([1]))).toThrow(ProtocolError)
    expect(() => codec.decode(new Uint8Array([200, 0, 0]))).toThrow(ProtocolError)
  })
})
