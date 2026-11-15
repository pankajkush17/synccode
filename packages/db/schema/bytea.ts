import { customType } from 'drizzle-orm/pg-core'

/**
 * Postgres `bytea` ↔ `Uint8Array`. Yjs updates and snapshots are opaque binary
 * blobs; storing them as bytea avoids any base64 inflation.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
})
