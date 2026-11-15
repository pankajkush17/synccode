import { Codec, type Frame, type MessageType } from '@synccode/shared'

/**
 * Client mirror of the server's MessageCodec. Both delegate to the single
 * `Codec` in @synccode/shared, so the frame layout cannot drift between them.
 */
const codec = new Codec()

export function encodeFrame(type: MessageType, roomRef: number, payload?: Uint8Array): Uint8Array {
  return codec.encode(type, roomRef, payload)
}

export function decodeFrame(data: ArrayBuffer | Uint8Array): Frame {
  return codec.decode(data instanceof Uint8Array ? data : new Uint8Array(data))
}

/** PING payload: the send time, echoed back verbatim in PONG. */
export function encodeTimestamp(ms: number): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, ms)
  return bytes
}

export function decodeTimestamp(payload: Uint8Array): number | null {
  if (payload.byteLength !== 8) return null
  return new DataView(payload.buffer, payload.byteOffset, 8).getFloat64(0)
}
