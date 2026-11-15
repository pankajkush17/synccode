import { isMessageType, type MessageType } from './MessageType'

export interface Frame {
  readonly type: MessageType
  readonly roomRef: number
  readonly payload: Uint8Array
}

export class FrameDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrameDecodeError'
  }
}

/**
 * Binary frame layout shared by client and server:
 *
 * ```
 * ┌────────┬──────────┬───────────────┐
 * │ type   │ roomRef  │ payload bytes │
 * │ 1 byte │ 2 bytes  │    N bytes    │
 * └────────┴──────────┴───────────────┘
 * ```
 *
 * `roomRef` is a big-endian uint16 the server assigns at connect time so frames
 * never have to carry the full slug.
 */
export class Codec {
  static readonly HEADER_BYTES = 3
  static readonly MAX_ROOM_REF = 0xffff

  private static readonly EMPTY = new Uint8Array(0)

  encode(type: MessageType, roomRef: number, payload: Uint8Array = Codec.EMPTY): Uint8Array {
    if (!Number.isInteger(roomRef) || roomRef < 0 || roomRef > Codec.MAX_ROOM_REF) {
      throw new RangeError(`roomRef out of range: ${roomRef}`)
    }
    const frame = new Uint8Array(Codec.HEADER_BYTES + payload.byteLength)
    frame[0] = type
    frame[1] = (roomRef >>> 8) & 0xff
    frame[2] = roomRef & 0xff
    frame.set(payload, Codec.HEADER_BYTES)
    return frame
  }

  decode(data: Uint8Array): Frame {
    if (data.byteLength < Codec.HEADER_BYTES) {
      throw new FrameDecodeError(`frame too short: ${data.byteLength} bytes`)
    }
    const type = data[0]!
    if (!isMessageType(type)) {
      throw new FrameDecodeError(`unknown message type: ${type}`)
    }
    const roomRef = (data[1]! << 8) | data[2]!
    // subarray: zero-copy view over the same memory.
    return { type, roomRef, payload: data.subarray(Codec.HEADER_BYTES) }
  }
}
