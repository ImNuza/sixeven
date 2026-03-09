import 'dotenv/config'
import cron from 'node-cron'
import { pool } from './db.js'
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

app.listen(PORT, () => {
  console.log(`SafeSeven API running on http://localhost:${PORT}`)
  // Fire-and-forget — don't delay the server from accepting requests
  refreshAllPrices('startup_refresh').catch(err =>
    console.error('[startup] Price refresh failed:', err.message)
  )
})

cron.schedule('*/5 * * * *', async () => {
  try {
    await refreshAllPrices('scheduled_refresh')
  } catch (err) {
    console.error('[cron] Price refresh failed:', err.message)
  }
})
