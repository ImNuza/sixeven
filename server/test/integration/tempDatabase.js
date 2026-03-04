import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../../db/migrations.js'

const { Pool } = pg

function buildConnectionString(databaseName) {
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function buildAdminConnectionString() {
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = '/postgres'
  return url.toString()
}

export async function createTempDatabase() {
  const dbName = `safeseven_test_${randomUUID().replaceAll('-', '')}`
  const adminPool = new Pool({
    connectionString: buildAdminConnectionString(),
  })

  await adminPool.query(`CREATE DATABASE "${dbName}"`)

  const pool = new Pool({
    connectionString: buildConnectionString(dbName),
  })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await runMigrations(client)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return {
    pool,
    async cleanup() {
      await pool.end()
      await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
      await adminPool.end()
    },
  }
}
