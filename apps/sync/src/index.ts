import { Config, ConfigError } from './config/Config'
import { SyncServer } from './SyncServer'

async function main(): Promise<void> {
  const config = Config.fromEnv()
  const server = new SyncServer(config)

  process.on('unhandledRejection', (reason) => {
    server.logger.error('unhandled rejection', { err: reason })
  })

  server.shutdown.install()
  try {
    await server.start()
  } catch (err) {
    server.logger.error('failed to start', { err })
    await server.stop().catch(() => {})
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  // Config failed before a logger existed: plain stderr is all we have.
  const message =
    err instanceof ConfigError ? err.message : err instanceof Error ? err.stack : String(err)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
