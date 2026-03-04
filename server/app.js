import express from 'express'
import cors from 'cors'
import { createAssetsController } from './controllers/assetsController.js'
import { createAuthController } from './controllers/authController.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { getInsightsPayload } from './services/insightsService.js'

export function createApp({
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
}) {
  const app = express()
  const assetsController = createAssetsController({ pool, recordNetWorthSnapshot })
  const requireAuth = createAuthMiddleware({
    getUserById: (id) => getUserById(pool, id),
  })
  const authController = createAuthController({
    createUserAccount: (payload) => createUserAccount(pool, payload),
    authenticateAccount: (payload) => authenticateAccount(pool, payload),
    getUserById: (id) => getUserById(pool, id),
    changePassword: (id, payload) => changePassword(pool, id, payload),
    deleteAccount: (id, payload) => deleteAccount(pool, id, payload),
    updateProfile: (id, payload) => updateProfile(pool, id, payload),
  })

  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'safeseven-api' })
  })

  app.post('/api/auth/register', authController.register)
  app.post('/api/auth/login', authController.login)
  app.get('/api/auth/me', requireAuth, authController.me)
  app.put('/api/auth/profile', requireAuth, authController.updateProfile)
  app.put('/api/auth/password', requireAuth, authController.updatePassword)
  app.delete('/api/auth/account', requireAuth, authController.removeAccount)

  app.get('/api/assets', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      return assetsController.listAssets(req, res)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  })
  app.post('/api/assets', requireAuth, assetsController.createAsset)
  app.put('/api/assets/:id', requireAuth, assetsController.updateAsset)
  app.delete('/api/assets/:id', requireAuth, assetsController.deleteAsset)

  app.get('/api/portfolio/summary', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const summary = await getPortfolioSummary(req.user.id)
      res.json(summary)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/portfolio/history', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const history = await getPortfolioHistory(req.user.id)
      res.json(history)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/insights', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const payload = await getInsightsPayload({
        pool,
        userId: req.user.id,
        getPortfolioSummary,
        query: req.query,
      })
      res.json(payload)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/prices/refresh', requireAuth, async (req, res) => {
    try {
      await refreshUserPrices(req.user.id, 'manual_refresh')
      res.json({ status: 'ok', refreshed: new Date().toISOString() })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/prices', requireAuth, async (req, res) => {
    try {
      await ensureFreshPrices(req.user.id)
      const { rows } = await pool.query(
        `SELECT DISTINCT pc.*
         FROM price_cache pc
         INNER JOIN assets a ON a.ticker = pc.symbol
         WHERE a.user_id = $1
         ORDER BY pc.updated_at DESC`,
        [req.user.id]
      )
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  return app
}
