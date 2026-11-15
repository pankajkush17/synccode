import { z } from 'zod'

/** Permission granted to a socket, announced in AUTH_ACK. */
export const PermissionSchema = z.enum(['read', 'write'])
export type PermissionName = z.infer<typeof PermissionSchema>

export const AuthAckSchema = z.object({
  permission: PermissionSchema,
  /** Which sync node accepted the socket — surfaced in the UI for the multi-node demo. */
  nodeId: z.string().min(1),
})
export type AuthAck = z.infer<typeof AuthAckSchema>

export const ErrorMessageSchema = z.object({
  kind: z.string().min(1),
  message: z.string(),
})
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>

/**
 * Control-plane payloads (AUTH_ACK, ERROR) are tiny JSON documents carried inside
 * the regular binary frame. Data-plane payloads (sync, awareness) stay raw binary.
 */
export class ControlPayload {
  private static readonly encoder = new TextEncoder()
  private static readonly decoder = new TextDecoder()

  static encode<T>(schema: z.ZodType<T>, value: T): Uint8Array {
    return ControlPayload.encoder.encode(JSON.stringify(schema.parse(value)))
  }

  static decode<T>(schema: z.ZodType<T>, payload: Uint8Array): T {
    return schema.parse(JSON.parse(ControlPayload.decoder.decode(payload)))
  }
}

/**
 * Close codes used by the sync service. 4xxx is the application-reserved range.
 * Codes listed in `FATAL_CLOSE_CODES` tell the client not to reconnect.
 */
export const CloseCode = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY_VIOLATION: 1008,
  TRY_AGAIN_LATER: 1013,
  PROTOCOL_ERROR: 4400,
  UNAUTHORIZED: 4401,
  NOT_FOUND: 4404,
} as const

export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  CloseCode.POLICY_VIOLATION,
  CloseCode.PROTOCOL_ERROR,
  CloseCode.UNAUTHORIZED,
  CloseCode.NOT_FOUND,
])
