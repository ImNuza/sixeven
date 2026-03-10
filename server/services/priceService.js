import axios from 'axios'
import { pool } from '../db.js'
import { recordNetWorthSnapshot } from './portfolioService.js'
import { resolveCoinGeckoId } from '../../shared/constants.js'

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY
const refreshLocks = new Map()

async function getCryptoPrices(coinIds) {
  if (!coinIds.length) {
    return {}
  }

  const ids = coinIds.join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,sgd`
  try {
    const { data } = await axios.get(url, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    return data
  } catch (err) {
    console.error('[CoinGecko Error]', err.message || err.code)
    if (err.response) {
      console.error('  Status:', err.response.status, 'Data:', err.response.data)
    }
    throw err
  }
}

async function getStockPriceAlphaVantage(ticker) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${ALPHA_VANTAGE_KEY}`
  const { data } = await axios.get(url, { timeout: 10000 })
  const quote = data['Global Quote']
  if (!quote || !quote['05. price']) {
    return null
  }
  return parseFloat(quote['05. price'])
}

async function getStockPriceYahoo(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const result = data?.chart?.result?.[0]
    if (!result) {
      console.warn(`[Yahoo Finance] No result for ${ticker}`)
      return null
    }
    return result.meta?.regularMarketPrice || null
  } catch (err) {
    console.error(`[Yahoo Finance ${ticker}]`, err.message || err.code)
    if (err.response?.status === 404) {
      console.error('  Symbol not found')
    } else if (err.code === 'ECONNREFUSED') {
      console.error('  Connection refused')
    } else if (err.response) {
      console.error('  Status:', err.response.status)
    }
    throw err
  }
}

async function getUsdSgdRate() {
  try {
    const price = await getStockPriceYahoo('USDSGD=X')
    return price || 1.35
  } catch (err) {
    console.error('[USD/SGD Rate] Failed, using fallback 1.35', err.message)
    return 1.35
  }
}

async function upsertPrice(client, symbol, priceUsd, priceSgd) {
  try {
    // Try PostgreSQL syntax first
    await client.query(
      `INSERT INTO price_cache (symbol, price_usd, price_sgd, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (symbol) DO UPDATE
       SET price_usd = $2, price_sgd = $3, updated_at = NOW()`,
      [symbol, priceUsd, priceSgd]
    )
  } catch (err) {
    if (err.message?.includes('CONFLICT') || err.message?.includes('syntax')) {
      // SQLite fallback: use INSERT OR REPLACE
      console.log(`[Price Cache] Using SQLite upsert for ${symbol}`)
      await client.query(
        `INSERT OR REPLACE INTO price_cache (symbol, price_usd, price_sgd, updated_at)
         VALUES ($1, $2, $3, datetime('now'))`,
        [symbol, priceUsd, priceSgd]
      )
    } else {
      throw err
    }
  }
}

async function updateAssetValue(client, assetId, priceSgd, quantity) {
  const newValue = parseFloat((priceSgd * quantity).toFixed(2))
  await client.query('UPDATE assets SET value = $1 WHERE id = $2', [newValue, assetId])
}

async function refreshUserPricesInternal(userId, snapshotSource = 'price_refresh') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const usdSgd = await getUsdSgdRate()
    const { rows: assets } = await client.query(
      `SELECT id, name, category, ticker, quantity
       FROM assets
       WHERE user_id = $1 AND ticker IS NOT NULL AND quantity IS NOT NULL`,
      [userId]
    )

    if (!assets.length) {
      await client.query('COMMIT')
      return { refreshed: false, reason: 'no_live_assets' }
    }

    const cryptoAssets = assets.filter((asset) => asset.category === 'CRYPTO')
    const stockAssets = assets.filter((asset) => asset.category === 'STOCKS')

    if (cryptoAssets.length) {
      try {
        // Map each asset's ticker to a CoinGecko ID (handles both "ETH" and "ethereum")
        const tickerToGeckoId = Object.fromEntries(
          cryptoAssets.map((a) => [a.ticker, resolveCoinGeckoId(a.ticker)])
        )
        const uniqueGeckoIds = [...new Set(Object.values(tickerToGeckoId).filter(Boolean))]
        const priceMap = await getCryptoPrices(uniqueGeckoIds)

        for (const asset of cryptoAssets) {
          const geckoId = tickerToGeckoId[asset.ticker]
          const coinData = geckoId ? priceMap[geckoId] : null
          if (!coinData) {
            continue
          }

          const priceSgd = coinData.sgd || coinData.usd * usdSgd
          const priceUsd = coinData.usd
          await upsertPrice(client, geckoId, priceUsd, priceSgd)
          await updateAssetValue(client, asset.id, priceSgd, parseFloat(asset.quantity))
        }
      } catch (err) {
        console.error('[CoinGecko Refresh] Error updating crypto prices:', err.message)
        // Keep the refresh moving if CoinGecko is unavailable.
      }
    }

    await Promise.all(stockAssets.map(async (asset) => {
      try {
        let priceNative = null

        // Yahoo Finance first — unlimited, no API key needed
        try {
          priceNative = await getStockPriceYahoo(asset.ticker)
        } catch (err) {
          console.log(`[Stock ${asset.ticker}] Yahoo Finance failed, trying fallback...`)
          priceNative = null
        }

        // Alpha Vantage as fallback only (25 req/day free tier — use sparingly)
        if (!priceNative && ALPHA_VANTAGE_KEY) {
          try {
            priceNative = await getStockPriceAlphaVantage(asset.ticker)
          } catch (err) {
            console.log(`[Stock ${asset.ticker}] Alpha Vantage also failed`)
            priceNative = null
          }
        }

        if (!priceNative) {
          console.warn(`[Stock ${asset.ticker}] Could not fetch price from any source`)
          return
        }

        const isSgxStock = asset.ticker.endsWith('.SI')
        const priceSgd = isSgxStock ? priceNative : priceNative * usdSgd
        const priceUsd = isSgxStock ? priceNative / usdSgd : priceNative

        await upsertPrice(client, asset.ticker, priceUsd, priceSgd)
        await updateAssetValue(client, asset.id, priceSgd, parseFloat(asset.quantity))
      } catch (err) {
        console.error(`[Stock ${asset.ticker}] Update failed:`, err.message)
        // Skip symbols that fail during a refresh cycle.
      }
    }))

    await recordNetWorthSnapshot(userId, snapshotSource, client)
    await client.query('COMMIT')
    return { refreshed: true, source: snapshotSource }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function refreshUserPrices(userId, snapshotSource = 'price_refresh') {
  const key = String(userId)
  if (!refreshLocks.has(key)) {
    refreshLocks.set(
      key,
      refreshUserPricesInternal(userId, snapshotSource).finally(() => {
        refreshLocks.delete(key)
      })
    )
  }

  return refreshLocks.get(key)
}

export async function refreshAllPrices(snapshotSource = 'price_refresh') {
  const { rows } = await pool.query(
    `SELECT DISTINCT user_id
     FROM assets
     WHERE user_id IS NOT NULL AND ticker IS NOT NULL AND quantity IS NOT NULL`
  )

  for (const row of rows) {
    await refreshUserPrices(row.user_id, snapshotSource)
  }
}

export async function ensureFreshPrices(userId, maxAgeMinutes = 2) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS live_count, MIN(pc.updated_at) AS oldest_update
     FROM assets a
     LEFT JOIN price_cache pc ON pc.symbol = a.ticker
     WHERE a.user_id = $1 AND a.ticker IS NOT NULL AND a.quantity IS NOT NULL`,
    [userId]
  )

  const row = rows[0]
  if (!row?.live_count) {
    return { refreshed: false, reason: 'no_live_assets' }
  }

  const oldestUpdate = row.oldest_update ? new Date(row.oldest_update) : null
  const stale = !oldestUpdate || Date.now() - oldestUpdate.getTime() > maxAgeMinutes * 60 * 1000
  if (!stale) {
    return { refreshed: false, reason: 'fresh' }
  }

  return refreshUserPrices(userId, 'auto_refresh')
}
