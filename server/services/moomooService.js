import axios from 'axios'

/**
 * Moomoo Singapore — Futu OpenAPI via OpenD gateway
 *
 * OpenD is a lightweight desktop process provided by Futu/moomoo that acts as
 * a local proxy to their trading servers. Once the user launches and logs in to
 * OpenD, our backend can query it over HTTP on localhost.
 *
 * Default OpenD HTTP port: 33333
 * Docs: https://openapi.futunn.com/futu-api-doc/en/
 *
 * @param {string} openDUrl  - Base URL of the running OpenD process, e.g. "http://127.0.0.1:33333"
 */
export async function fetchMoomooPositions(openDUrl = 'http://127.0.0.1:33333') {
  const base = openDUrl.replace(/\/$/, '')
  const client = axios.create({ baseURL: base, timeout: 15000 })

  // 1. Get account list
  let accounts
  try {
    const { data } = await client.post('/moomoo/get_acc_list', { trd_env: 1 }) // 1 = REAL
    accounts = data?.data?.acc_list || []
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to OpenD. Make sure it is running at ' + base)
    }
    throw new Error('OpenD connection failed: ' + (err.response?.data?.msg || err.message))
  }

  if (!accounts.length) {
    throw new Error('No moomoo accounts found. Make sure you are logged in to OpenD.')
  }

  const account = accounts[0]
  const accId = account.acc_id || account.trd_acc_id

  // 2. Get positions
  const { data: posData } = await client.post('/moomoo/get_positions', {
    header: { trd_env: 1, acc_id: accId },
  })

  const rawPositions = posData?.data?.position_list || []
  return {
    accountId: String(accId),
    positions: rawPositions.map(pos => normalizePosition(pos, accId)),
  }
}

function normalizePosition(pos, accountId) {
  const qty = Number(pos.qty ?? pos.position_side ?? 0)
  const price = Number(pos.current_price ?? pos.last_price ?? 0)
  const value = Number(pos.market_val ?? price * qty)
  const costPrice = Number(pos.cost_price ?? pos.pl_cost_price ?? 0)
  const pnl = Number(pos.unrealized_pl ?? pos.pl_val ?? 0)

  return {
    accountId: String(accountId),
    code: pos.code || '',
    ticker: normalizeTicker(pos.code || ''),
    name: pos.stock_name || pos.name || pos.code || '',
    assetClass: 'STK',
    quantity: qty,
    marketPrice: price,
    marketValue: value,
    currency: pos.currency || (String(pos.code || '').includes('.SZ') || String(pos.code || '').includes('.SH') ? 'HKD' : String(pos.code || '').endsWith('.HK') ? 'HKD' : String(pos.code || '').endsWith('.SI') ? 'SGD' : 'USD'),
    avgCost: costPrice,
    unrealizedPnl: pnl,
  }
}

/**
 * Futu OpenAPI uses codes like "D05.SI", "700.HK", "AAPL.US".
 * Convert to Yahoo Finance-compatible tickers for live price tracking.
 */
function normalizeTicker(code) {
  if (!code) return ''
  // SGX: D05.SI → D05.SI (already Yahoo-compatible)
  if (code.endsWith('.SI')) return code
  // HKEX: 700.HK → 0700.HK
  if (code.endsWith('.HK')) {
    const num = code.replace('.HK', '')
    return num.padStart(4, '0') + '.HK'
  }
  // US: AAPL.US → AAPL
  if (code.endsWith('.US')) return code.replace('.US', '')
  return code
}

export function getDemoPositions() {
  return {
    accountId: 'MO7654321',
    positions: [
      // SGX — Singapore stocks
      { accountId: 'MO7654321', code: 'D05.SI', ticker: 'D05.SI', name: 'DBS Group Holdings', assetClass: 'STK', quantity: 100, marketPrice: 36.5, marketValue: 3650, currency: 'SGD', avgCost: 32.0, unrealizedPnl: 450 },
      { accountId: 'MO7654321', code: 'O39.SI', ticker: 'O39.SI', name: 'OCBC Bank', assetClass: 'STK', quantity: 200, marketPrice: 14.8, marketValue: 2960, currency: 'SGD', avgCost: 13.5, unrealizedPnl: 260 },
      { accountId: 'MO7654321', code: 'Z74.SI', ticker: 'Z74.SI', name: 'Singtel', assetClass: 'STK', quantity: 500, marketPrice: 2.8, marketValue: 1400, currency: 'SGD', avgCost: 2.5, unrealizedPnl: 150 },
      { accountId: 'MO7654321', code: 'ES3.SI', ticker: 'ES3.SI', name: 'SPDR STI ETF', assetClass: 'STK', quantity: 300, marketPrice: 3.55, marketValue: 1065, currency: 'SGD', avgCost: 3.2, unrealizedPnl: 105 },
      // US — popular on moomoo SG
      { accountId: 'MO7654321', code: 'SE.US', ticker: 'SE', name: 'Sea Limited', assetClass: 'STK', quantity: 20, marketPrice: 72.5, marketValue: 1450, currency: 'USD', avgCost: 60.0, unrealizedPnl: 250 },
      { accountId: 'MO7654321', code: 'GRAB.US', ticker: 'GRAB', name: 'Grab Holdings', assetClass: 'STK', quantity: 500, marketPrice: 4.2, marketValue: 2100, currency: 'USD', avgCost: 3.5, unrealizedPnl: 350 },
    ],
  }
}
