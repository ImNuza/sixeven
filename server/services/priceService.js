import axios from 'axios'
import { pool } from '../db.js'
import { recordNetWorthSnapshot } from './portfolioService.js'

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY

// CoinGecko: fetch crypto prices in USD and SGD
async function getCryptoPrices(coinIds) {
  if (!coinIds.length) return {}
  const ids = coinIds.join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,sgd`
  const { data } = await axios.get(url, { timeout: 10000 })
  return data // e.g. { bitcoin: { usd: 60000, sgd: 81000 }, ethereum: { ... } }
}

// Alpha Vantage: fetch a single stock price in USD
async function getStockPriceAlphaVantage(ticker) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${ALPHA_VANTAGE_KEY}`
  const { data } = await axios.get(url, { timeout: 10000 })
  const quote = data['Global Quote']
  if (!quote || !quote['05. price']) return null
  return parseFloat(quote['05. price'])
}

// Yahoo Finance (unofficial): fetch a single stock price in its native currency
async function getStockPriceYahoo(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
  const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } })
  const result = data?.chart?.result?.[0]
  if (!result) return null
  return result.meta?.regularMarketPrice || null
}

// Get USD/SGD exchange rate via Yahoo Finance
async function getUsdSgdRate() {
  try {
    const price = await getStockPriceYahoo('USDSGD=X')
    return price || 1.35
  } catch {
    return 1.35 // fallback rate
  }
}

// Upsert a price into price_cache
async function upsertPrice(symbol, priceUsd, priceSgd) {
  await pool.query(
    `INSERT INTO price_cache (symbol, price_usd, price_sgd, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (symbol) DO UPDATE
     SET price_usd = $2, price_sgd = $3, updated_at = NOW()`,
    [symbol, priceUsd, priceSgd]
  )
}

// Update a single asset's value based on quantity × price_sgd
async function updateAssetValue(assetId, priceSgd, quantity) {
  const newValue = parseFloat((priceSgd * quantity).toFixed(2))
  await pool.query('UPDATE assets SET value = $1 WHERE id = $2', [newValue, assetId])
}

// Main: refresh all prices for all priceable assets
export async function refreshAllPrices(snapshotSource = 'price_refresh') {
  console.log('[prices] Refreshing all prices...')

  const usdSgd = await getUsdSgdRate()
  console.log(`[prices] USD/SGD rate: ${usdSgd}`)

  // Fetch all assets with tickers and quantities
  const { rows: assets } = await pool.query(
    `SELECT id, name, category, ticker, quantity FROM assets WHERE ticker IS NOT NULL AND quantity IS NOT NULL`
  )

  // Split into crypto vs stocks
  const cryptoAssets = assets.filter((a) => a.category === 'CRYPTO')
  const stockAssets = assets.filter((a) => a.category === 'STOCKS')

  // --- CRYPTO via CoinGecko ---
  if (cryptoAssets.length) {
    const coinIds = cryptoAssets.map((a) => a.ticker)
    try {
      const prices = await getCryptoPrices(coinIds)
      for (const asset of cryptoAssets) {
        const coinData = prices[asset.ticker]
        if (!coinData) {
          console.warn(`[prices] No CoinGecko data for ${asset.ticker}`)
          continue
        }
        const priceSgd = coinData.sgd || coinData.usd * usdSgd
        const priceUsd = coinData.usd
        await upsertPrice(asset.ticker, priceUsd, priceSgd)
        await updateAssetValue(asset.id, priceSgd, parseFloat(asset.quantity))
        console.log(`[prices] ${asset.name}: SGD ${priceSgd.toFixed(2)} × ${asset.quantity}`)
      }
    } catch (err) {
      console.error('[prices] CoinGecko error:', err.message)
    }
  }

  // --- STOCKS via Alpha Vantage, Yahoo Finance as fallback ---
  for (const asset of stockAssets) {
    try {
      let priceNative = null

      // Try Alpha Vantage first (USD prices for US stocks)
      try {
        priceNative = await getStockPriceAlphaVantage(asset.ticker)
        if (priceNative) console.log(`[prices] ${asset.ticker} via Alpha Vantage: ${priceNative}`)
      } catch {
        // fall through to Yahoo
      }

      // Fallback to Yahoo Finance
      if (!priceNative) {
        priceNative = await getStockPriceYahoo(asset.ticker)
        if (priceNative) console.log(`[prices] ${asset.ticker} via Yahoo Finance: ${priceNative}`)
      }

      if (!priceNative) {
        console.warn(`[prices] No price found for ${asset.ticker}`)
        continue
      }

      // SGX stocks (e.g. ES3.SI) are already in SGD; US stocks are in USD
      const isSgxStock = asset.ticker.endsWith('.SI')
      const priceSgd = isSgxStock ? priceNative : priceNative * usdSgd
      const priceUsd = isSgxStock ? priceNative / usdSgd : priceNative

      await upsertPrice(asset.ticker, priceUsd, priceSgd)
      await updateAssetValue(asset.id, priceSgd, parseFloat(asset.quantity))
      console.log(`[prices] ${asset.name}: SGD ${priceSgd.toFixed(2)} × ${asset.quantity}`)
    } catch (err) {
      console.error(`[prices] Error fetching ${asset.ticker}:`, err.message)
    }
  }

  await recordNetWorthSnapshot(snapshotSource)
  console.log('[prices] Refresh complete.')
}
