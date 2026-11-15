import { runMigrations } from '@synccode/db'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    redisUrl: string
  }
}

/**
 * Provides a real Postgres and a real Redis to the integration suites.
 *
 * By default both are started with Testcontainers (needs a Docker daemon). Set
 * TEST_DATABASE_URL and TEST_REDIS_URL to run against existing instances instead.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const teardown: Array<() => Promise<unknown>> = []

  let databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
    const container = await new PostgreSqlContainer('postgres:16-alpine').start()
    teardown.push(() => container.stop())
    databaseUrl = container.getConnectionUri()
  }

  let redisUrl = process.env.TEST_REDIS_URL
  if (!redisUrl) {
    const { RedisContainer } = await import('@testcontainers/redis')
    const container = await new RedisContainer('redis:7-alpine').start()
    teardown.push(() => container.stop())
    redisUrl = container.getConnectionUrl()
  }

  await runMigrations(databaseUrl)
  project.provide('databaseUrl', databaseUrl)
  project.provide('redisUrl', redisUrl)

  return async () => {
    await Promise.allSettled(teardown.map((stop) => stop()))
  }
}
