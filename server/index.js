import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import { pool } from './db.js'
import { refreshAllPrices } from './services/priceService.js'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from './services/portfolioService.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

function normalizeAssetPayload(body = {}) {
  return {
    name: body.name,
    category: body.category,
    ticker: body.ticker || null,
    value: body.value,
    cost: body.cost,
    quantity: body.quantity ?? null,
    date: body.date,
    institution: body.institution || null,
    details: body.details && typeof body.details === 'object' ? body.details : {},
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'safeseven-api' })
})

// ── Assets ────────────────────────────────────────────────────────────────────

app.get('/api/assets', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM assets ORDER BY category, name')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/assets', async (req, res) => {
  const { name, category, ticker, value, cost, quantity, date, institution, details } = normalizeAssetPayload(req.body)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO assets (name, category, ticker, value, cost, quantity, date, institution, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, category, ticker, value, cost, quantity, date, institution, details]
    )
    await recordNetWorthSnapshot('asset_create', client)
    await client.query('COMMIT')
    res.status(201).json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

app.put('/api/assets/:id', async (req, res) => {
  const { id } = req.params
  const { name, category, ticker, value, cost, quantity, date, institution, details } = normalizeAssetPayload(req.body)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE assets SET name=$1, category=$2, ticker=$3, value=$4, cost=$5,
       quantity=$6, date=$7, institution=$8, details=$9 WHERE id=$10 RETURNING *`,
      [name, category, ticker, value, cost, quantity, date, institution, details, id]
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Asset not found' })
    }
    await recordNetWorthSnapshot('asset_update', client)
    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

app.delete('/api/assets/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('DELETE FROM assets WHERE id = $1', [req.params.id])
    if (!result.rowCount) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Asset not found' })
    }
    await recordNetWorthSnapshot('asset_delete', client)
    await client.query('COMMIT')
    res.status(204).send()
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ── Portfolio ─────────────────────────────────────────────────────────────────

app.get('/api/portfolio/summary', async (req, res) => {
  try {
    const summary = await getPortfolioSummary()
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/portfolio/history', async (req, res) => {
  try {
    const history = await getPortfolioHistory()
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Prices ────────────────────────────────────────────────────────────────────

app.get('/api/prices/refresh', async (req, res) => {
  try {
    await refreshAllPrices('manual_refresh')
    res.json({ status: 'ok', refreshed: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/prices', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM price_cache ORDER BY updated_at DESC')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Startup ───────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`SafeSeven API running on http://localhost:${PORT}`)
  // Refresh prices immediately on start, then every 15 minutes
  try {
    await refreshAllPrices('startup_refresh')
  } catch (err) {
    console.error('[startup] Price refresh failed:', err.message)
  }
})

// Schedule: every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    await refreshAllPrices('scheduled_refresh')
  } catch (err) {
    console.error('[cron] Price refresh failed:', err.message)
  }
})
