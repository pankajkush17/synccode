import 'server-only'
import { z } from 'zod'

const ServerEnvSchema = z.object({
  SYNC_HTTP_URL: z.string().url().default('http://localhost:4000'),
})

/** Read lazily so `next build` does not need the variable. */
export function syncHttpUrl(): string {
  const { SYNC_HTTP_URL } = ServerEnvSchema.parse({
    SYNC_HTTP_URL: process.env.SYNC_HTTP_URL || undefined,
  })
  return SYNC_HTTP_URL.replace(/\/$/, '')
}
