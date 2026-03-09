import '../server/env.js'
import { pool } from '../server/db.js'
import { runMigrations } from '../server/db/migrations.js'
import { ensureFreshPrices, refreshAllPrices, refreshUserPrices } from '../server/services/priceService.js'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from '../server/services/portfolioService.js'
import { authenticateAccount, changePassword, createUserAccount, deleteAccount, getUserById, updateProfile } from '../server/services/accountService.js'
import { createApp } from '../server/app.js'

const app = createApp({
  pool,
  ensureFreshPrices,
  refreshUserPrices,
  getPortfolioSummary,
  getPortfolioHistory,
  recordNetWorthSnapshot,
  createUserAccount,
  authenticateAccount,
  getUserById,
  changePassword,
  deleteAccount,
  updateProfile,
})

// Run migrations once on cold start
let migrated = false
async function ensureMigrations() {
  if (migrated) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await runMigrations(client)
    await client.query('COMMIT')
    migrated = true
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[vercel] Migration failed:', error.message)
  } finally {
    client.release()
  }
}

// Wrap the Express app to ensure migrations run first
const handler = async (req, res) => {
  await ensureMigrations()
  return app(req, res)
}

export default handler
