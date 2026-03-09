import './env.js'
import cron from 'node-cron'
import { pool } from './db.js'
import { runMigrations } from './db/migrations.js'
import { ensureFreshPrices, refreshAllPrices, refreshUserPrices } from './services/priceService.js'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from './services/portfolioService.js'
import { authenticateAccount, changePassword, createUserAccount, deleteAccount, getUserById, updateProfile } from './services/accountService.js'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
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

async function prepareDatabase() {
  console.log('[startup] Connecting to database and running migrations...')
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
}

prepareDatabase()
  .then(() => {
    console.log('[startup] Database ready.')
    app.listen(PORT, () => {
      console.log(`SafeSeven API running on http://localhost:${PORT}`)
      // Defer initial price refresh by 20s so the server responds immediately
      setTimeout(() => {
        refreshAllPrices('startup_refresh').catch(err =>
          console.error('[startup] Price refresh failed:', err.message)
        )
      }, 20000)
    })
  })
  .catch((error) => {
    console.error('[startup] Server failed to start:', error.message)
    process.exit(1)
  })

cron.schedule('*/5 * * * *', async () => {
  try {
    await refreshAllPrices('scheduled_refresh')
  } catch (err) {
    console.error('[cron] Price refresh failed:', err.message)
  }
})
