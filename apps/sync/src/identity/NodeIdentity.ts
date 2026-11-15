import { randomUUID } from 'node:crypto'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * One UUID per process, generated at boot. It is stamped on every Redis message
 * so a node can recognise — and drop — its own publications (echo suppression).
 */
export class NodeIdentity {
  static readonly BYTES = 16

  /** The 16 raw bytes of the UUID, as they appear in the envelope header. */
  readonly bytes: Uint8Array

  constructor(
    readonly id: string = randomUUID(),
    /** Human-friendly label for logs and the UI (e.g. "sync-a"). */
    readonly name: string = id.slice(0, 8),
  ) {
    this.bytes = NodeIdentity.toBytes(id)
  }

  static toBytes(id: string): Uint8Array {
    if (!UUID_PATTERN.test(id)) throw new Error(`not a UUID: ${id}`)
    return new Uint8Array(Buffer.from(id.replaceAll('-', ''), 'hex'))
  }

  static fromBytes(bytes: Uint8Array): string {
    if (bytes.byteLength !== NodeIdentity.BYTES) {
      throw new Error(`node id must be ${NodeIdentity.BYTES} bytes, got ${bytes.byteLength}`)
    }
    const hex = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}
