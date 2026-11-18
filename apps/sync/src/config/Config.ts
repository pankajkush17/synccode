import { z } from 'zod'

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const EnvSchema = z.object({
  // Required — the process refuses to boot without them.
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  EDIT_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'EDIT_SECRET must be 32 bytes, hex encoded (64 chars)'),

  // Optional with safe defaults.
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_NAME: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z.string().default('*'),
  RUN_MIGRATIONS: booleanFromEnv.default('false'),

  FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  IDLE_EVICTION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  COMPACTION_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  COMPACTION_THRESHOLD: z.coerce.number().int().positive().default(1000),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  MAX_BUFFERED_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 1024 * 1024),
  MAX_PAYLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().positive().default(25_000),

  // Self-ping to stop free hosts from sleeping. Render sets RENDER_EXTERNAL_URL itself.
  KEEPALIVE_URL: z.string().url().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  KEEPALIVE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60_000),
})

export type ParsedEnv = z.infer<typeof EnvSchema>
export type EnvInput = z.input<typeof EnvSchema>

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

/**
 * The single place environment variables are read. Everything else receives
 * typed values through getters — no `process.env.FOO ?? 'default'` elsewhere.
 */
export class Config {
  private constructor(private readonly values: ParsedEnv) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): Config {
    return Config.parse(env)
  }

  /** For tests and scripts: build a config from explicit values. */
  static from(values: EnvInput): Config {
    return Config.parse(values)
  }

  private static parse(input: unknown): Config {
    const result = EnvSchema.safeParse(input)
    if (!result.success) {
      throw new ConfigError(
        result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      )
    }
    return new Config(result.data)
  }

  get databaseUrl(): string {
    return this.values.DATABASE_URL
  }
  get redisUrl(): string {
    return this.values.REDIS_URL
  }
  get editSecret(): Buffer {
    return Buffer.from(this.values.EDIT_SECRET, 'hex')
  }
  get httpPort(): number {
    return this.values.PORT
  }
  get logLevel(): ParsedEnv['LOG_LEVEL'] {
    return this.values.LOG_LEVEL
  }
  get nodeName(): string | undefined {
    return this.values.NODE_NAME
  }
  /** `null` means every origin is allowed. */
  get allowedOrigins(): readonly string[] | null {
    const raw = this.values.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
    return raw.length === 0 || raw.includes('*') ? null : raw
  }
  get runMigrations(): boolean {
    return this.values.RUN_MIGRATIONS
  }
  get flushIntervalMs(): number {
    return this.values.FLUSH_INTERVAL_MS
  }
  get idleEvictionMs(): number {
    return this.values.IDLE_EVICTION_MS
  }
  get compactionIntervalMs(): number {
    return this.values.COMPACTION_INTERVAL_MS
  }
  get compactionThreshold(): number {
    return this.values.COMPACTION_THRESHOLD
  }
  get heartbeatIntervalMs(): number {
    return this.values.HEARTBEAT_INTERVAL_MS
  }
  get maxBufferedBytes(): number {
    return this.values.MAX_BUFFERED_BYTES
  }
  get maxPayloadBytes(): number {
    return this.values.MAX_PAYLOAD_BYTES
  }
  get shutdownGraceMs(): number {
    return this.values.SHUTDOWN_GRACE_MS
  }
  /**
   * `null` disables the self-ping (the default everywhere except Render).
   * `/readyz` also pings Postgres and Redis, so idle free-tier databases stay active too.
   */
  get keepAliveUrl(): string | null {
    if (this.values.KEEPALIVE_URL) return this.values.KEEPALIVE_URL
    const external = this.values.RENDER_EXTERNAL_URL
    return external ? `${external.replace(/\/$/, '')}/readyz` : null
  }
  get keepAliveIntervalMs(): number {
    return this.values.KEEPALIVE_INTERVAL_MS
  }
}
