import { pool } from './db.js'
import { runMigrations } from './db/migrations.js'

async function migrate() {
  const client = await pool.connect()
  try {
    console.log('Running migrations...')
    await client.query('BEGIN')
    const result = await runMigrations(client)
    await client.query('COMMIT')
    console.log('Schema created.')
    console.log(result.seeded ? 'Seed data inserted.' : 'Seed data already present.')
    console.log('Migration complete.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
