import { NodeIdentity } from '../identity/NodeIdentity'

/**
 * - `update`: a Yjs document update to apply and fan out.
 * - `awareness`: an awareness (presence) update to apply and fan out.
 * - `sync-request`: a state vector from a node that just loaded the room; nodes
 *   already holding it answer with the diff, closing the gap between "what is
 *   in Postgres" and "what is still only in another node's memory".
 */
export type EnvelopeKind = 'update' | 'awareness' | 'sync-request'

const KIND_TO_BYTE: Record<EnvelopeKind, number> = { update: 0, awareness: 1, 'sync-request': 2 }
const BYTE_TO_KIND: readonly EnvelopeKind[] = ['update', 'awareness', 'sync-request']

/**
 * What travels over Redis: `16 bytes nodeId | 1 byte kind | payload`.
 * The nodeId header is what makes echo suppression possible.
 */
export class MessageEnvelope {
  static readonly HEADER_BYTES = NodeIdentity.BYTES + 1

  constructor(
    readonly nodeId: string,
    readonly kind: EnvelopeKind,
    readonly payload: Uint8Array,
  ) {}

  static encode(env: MessageEnvelope): Buffer {
    const buf = Buffer.allocUnsafe(MessageEnvelope.HEADER_BYTES + env.payload.byteLength)
    buf.set(NodeIdentity.toBytes(env.nodeId), 0)
    buf[NodeIdentity.BYTES] = KIND_TO_BYTE[env.kind]
    buf.set(env.payload, MessageEnvelope.HEADER_BYTES)
    return buf
  }

  static decode(buf: Uint8Array): MessageEnvelope {
    if (buf.byteLength < MessageEnvelope.HEADER_BYTES) {
      throw new Error(`envelope too short: ${buf.byteLength} bytes`)
    }
    const kind = BYTE_TO_KIND[buf[NodeIdentity.BYTES]!]
    if (!kind) throw new Error(`unknown envelope kind: ${buf[NodeIdentity.BYTES]}`)
    return new MessageEnvelope(
      NodeIdentity.fromBytes(buf.subarray(0, NodeIdentity.BYTES)),
      kind,
      buf.subarray(MessageEnvelope.HEADER_BYTES),
    )
  }
}
