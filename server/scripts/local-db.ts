// Runs a real PostgreSQL server from npm-provided binaries, for machines where
// Docker isn't available. Same port and credentials as docker-compose.yml.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url))
const isNew = !existsSync(databaseDir)

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'ease',
  password: 'ease',
  port: 5433,
  persistent: true,
  // Windows locales (e.g. English_India.1252) default to a non-UTF-8 encoding; force UTF-8.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
})

if (isNew) await pg.initialise()
await pg.start()
if (isNew) await pg.createDatabase('ease_work')

console.log('PostgreSQL running on localhost:5433 (db: ease_work). Press Ctrl+C to stop.')

async function shutdown() {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
