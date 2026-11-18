import { describe, expect, it } from 'vitest'
import { Config, ConfigError } from '../../src/config/Config'

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  EDIT_SECRET: 'ab'.repeat(32),
}

describe('Config', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = Config.fromEnv({ ...valid, PORT: '4100' })
    expect(config.httpPort).toBe(4100)
    expect(config.editSecret.byteLength).toBe(32)
    expect(config.flushIntervalMs).toBe(500)
    expect(config.idleEvictionMs).toBe(300_000)
    expect(config.compactionThreshold).toBe(1000)
    expect(config.allowedOrigins).toBeNull()
    expect(config.runMigrations).toBe(false)
  })

  it('normalises the origin allow-list', () => {
    const config = Config.fromEnv({ ...valid, ALLOWED_ORIGINS: 'http://a.dev/, https://b.dev' })
    expect(config.allowedOrigins).toEqual(['http://a.dev', 'https://b.dev'])
  })

  it('keeps the self-ping off unless a public URL is known', () => {
    expect(Config.fromEnv(valid).keepAliveUrl).toBeNull()
    expect(
      Config.fromEnv({ ...valid, RENDER_EXTERNAL_URL: 'https://x.onrender.com/' }).keepAliveUrl,
    ).toBe('https://x.onrender.com/readyz')
    expect(
      Config.fromEnv({
        ...valid,
        RENDER_EXTERNAL_URL: 'https://x.onrender.com',
        KEEPALIVE_URL: 'https://elsewhere.dev/ping',
      }).keepAliveUrl,
    ).toBe('https://elsewhere.dev/ping')
    expect(Config.fromEnv(valid).keepAliveIntervalMs).toBe(600_000)
  })

  it('fails fast, naming every missing variable', () => {
    try {
      Config.fromEnv({})
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError)
      const message = (err as ConfigError).message
      expect(message).toContain('DATABASE_URL')
      expect(message).toContain('REDIS_URL')
      expect(message).toContain('EDIT_SECRET')
    }
  })

  it('rejects a malformed secret', () => {
    expect(() => Config.fromEnv({ ...valid, EDIT_SECRET: 'too-short' })).toThrow(ConfigError)
  })
})
