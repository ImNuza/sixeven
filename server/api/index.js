import '../env.js'
import { pool } from '../db.js'
import { runMigrations } from '../db/migrations.js'
import { ensureFreshPrices, refreshAllPrices, refreshUserPrices } from '../services/priceService.js'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from '../services/portfolioService.js'
import { authenticateAccount, changePassword, createUserAccount, deleteAccount, getUserById, updateProfile } from '../services/accountService.js'
import { createApp } from '../app.js'

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
