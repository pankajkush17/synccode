import { EDIT_TOKEN_QUERY_KEY } from '@synccode/shared'
import { z } from 'zod'

const ClientEnvSchema = z.object({
  // Must be referenced literally so Next.js can inline it at build time.
  NEXT_PUBLIC_SYNC_WS_URL: z
    .string()
    .regex(/^wss?:\/\//, 'NEXT_PUBLIC_SYNC_WS_URL must start with ws:// or wss://')
    .default('ws://localhost:4000'),
})

const parsed = ClientEnvSchema.parse({
  NEXT_PUBLIC_SYNC_WS_URL: process.env.NEXT_PUBLIC_SYNC_WS_URL || undefined,
})

export const clientConfig = {
  syncWsUrl: parsed.NEXT_PUBLIC_SYNC_WS_URL.replace(/\/$/, ''),
} as const

export function wsUrl(slug: string, editToken?: string | null): string {
  const query = editToken ? `?${EDIT_TOKEN_QUERY_KEY}=${encodeURIComponent(editToken)}` : ''
  return `${clientConfig.syncWsUrl}/ws/${slug}${query}`
}
