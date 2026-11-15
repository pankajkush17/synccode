/**
 * Wire-level message types. The numeric value is the first byte of every frame.
 *
 * 0–2 are the Yjs sync protocol, 3 is the awareness protocol, 4+ are control messages.
 */
export enum MessageType {
  SYNC_STEP_1 = 0,
  SYNC_STEP_2 = 1,
  UPDATE = 2,
  AWARENESS = 3,
  AUTH_ACK = 4,
  ERROR = 5,
  PING = 6,
  PONG = 7,
}

const KNOWN_TYPES: ReadonlySet<number> = new Set(
  Object.values(MessageType).filter((v): v is number => typeof v === 'number'),
)

export function isMessageType(value: number): value is MessageType {
  return KNOWN_TYPES.has(value)
}

export function messageTypeName(type: MessageType): string {
  return MessageType[type] ?? `UNKNOWN(${type})`
}
