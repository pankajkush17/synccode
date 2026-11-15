import { runMigrations } from './index'

const url = process.env.DATABASE_URL
if (!url) {
  process.stderr.write('DATABASE_URL is required\n')
  process.exit(1)
}

runMigrations(url)
  .then(() => {
    process.stdout.write('migrations applied\n')
  })
  .catch((err: unknown) => {
    process.stderr.write(`migration failed: ${err instanceof Error ? err.stack : String(err)}\n`)
    process.exit(1)
  })
