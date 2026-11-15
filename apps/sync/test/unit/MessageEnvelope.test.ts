import { describe, expect, it } from 'vitest'
import { NodeIdentity } from '../../src/identity/NodeIdentity'
import { type EnvelopeKind, MessageEnvelope } from '../../src/pubsub/MessageEnvelope'

describe('MessageEnvelope', () => {
  const node = new NodeIdentity()

  it.each<EnvelopeKind>(['update', 'awareness', 'sync-request'])('round-trips kind %s', (kind) => {
    const payload = new Uint8Array([0, 1, 2, 255])
    const wire = MessageEnvelope.encode(new MessageEnvelope(node.id, kind, payload))
    expect(wire.byteLength).toBe(MessageEnvelope.HEADER_BYTES + payload.byteLength)

    const decoded = MessageEnvelope.decode(wire)
    expect(decoded.nodeId).toBe(node.id)
    expect(decoded.kind).toBe(kind)
    expect(Array.from(decoded.payload)).toEqual(Array.from(payload))
  })

  it('handles empty payloads', () => {
    const decoded = MessageEnvelope.decode(
      MessageEnvelope.encode(new MessageEnvelope(node.id, 'update', new Uint8Array(0))),
    )
    expect(decoded.payload.byteLength).toBe(0)
  })

  it('rejects truncated or unknown envelopes', () => {
    expect(() => MessageEnvelope.decode(new Uint8Array(5))).toThrow(/too short/)
    const wire = MessageEnvelope.encode(new MessageEnvelope(node.id, 'update', new Uint8Array(1)))
    wire[NodeIdentity.BYTES] = 99
    expect(() => MessageEnvelope.decode(wire)).toThrow(/unknown envelope kind/)
  })
})

describe('NodeIdentity', () => {
  it('is unique per instance and round-trips through bytes', () => {
    const a = new NodeIdentity()
    const b = new NodeIdentity()
    expect(a.id).not.toBe(b.id)
    expect(a.bytes.byteLength).toBe(16)
    expect(NodeIdentity.fromBytes(a.bytes)).toBe(a.id)
  })

  it('rejects non-UUIDs', () => {
    expect(() => new NodeIdentity('nope')).toThrow()
    expect(() => NodeIdentity.fromBytes(new Uint8Array(3))).toThrow()
  })
})
