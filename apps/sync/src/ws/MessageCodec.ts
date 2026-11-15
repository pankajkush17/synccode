import { Codec, type Frame, FrameDecodeError, type MessageType } from '@synccode/shared'
import { ProtocolError } from '../errors'

/**
 * Server-side face of the shared frame codec. The byte layout lives in
 * `@synccode/shared` (one implementation for both ends of the wire); this class
 * adapts it to Node buffers and to the server's error hierarchy.
 */
export class MessageCodec {
  static readonly HEADER_BYTES = Codec.HEADER_BYTES

  private readonly codec = new Codec()

  encode(type: MessageType, roomRef: number, payload?: Uint8Array): Uint8Array {
    return this.codec.encode(type, roomRef, payload)
  }

  decode(buf: Uint8Array): Frame {
    try {
      return this.codec.decode(buf)
    } catch (err) {
      if (err instanceof FrameDecodeError) throw new ProtocolError(err.message, { cause: err })
      throw err
    }
  }
}
