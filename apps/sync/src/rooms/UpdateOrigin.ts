/**
 * Transaction origins for document and awareness changes. A change that came
 * from a client socket uses that socket's RoomSession as its origin; everything
 * else uses one of these markers. The origin decides what happens next:
 *
 * | origin       | send to local sockets | publish to Redis | persist |
 * |--------------|-----------------------|------------------|---------|
 * | RoomSession  | all but the sender    | yes              | yes     |
 * | REDIS        | all                   | no               | no      |
 * | HYDRATE      | (none attached yet)   | no               | no      |
 */
export const UpdateOrigin = {
  REDIS: Symbol('origin:redis'),
  HYDRATE: Symbol('origin:hydrate'),
} as const

export type SystemOrigin = (typeof UpdateOrigin)[keyof typeof UpdateOrigin]

export function isSystemOrigin(origin: unknown): origin is SystemOrigin {
  return origin === UpdateOrigin.REDIS || origin === UpdateOrigin.HYDRATE
}
