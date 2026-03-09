import axios from 'axios'
import https from 'https'

// Skip TLS verification for the local IBKR Client Portal Gateway
// (it uses a self-signed certificate by default)
const localAgent = new https.Agent({ rejectUnauthorized: false })

/**
 * Fetch positions from an IBKR Client Portal Web API Gateway.
 *
 * The gateway is a lightweight Java process the user runs locally (default port 5000).
 * It handles authentication with IBKR servers transparently once the user logs in
 * via their browser at https://localhost:5000.
 *
 * @param {string} gatewayUrl - Base URL of the running gateway, e.g. "https://localhost:5000"
 */
export async function fetchIbkrPositions(gatewayUrl = 'https://localhost:5000') {
  const base = gatewayUrl.replace(/\/$/, '')
  const client = axios.create({
    baseURL: base,
    httpsAgent: localAgent,
    timeout: 15000,
    headers: { 'User-Agent': 'SafeSeven/1.0', 'Content-Type': 'application/json' },
  })

  // 1. Retrieve authenticated accounts
  let accounts
  try {
    const { data } = await client.get('/v1/api/portfolio/accounts')
    accounts = Array.isArray(data) ? data : []
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to IBKR Gateway. Make sure it is running at ' + base)
    }
    throw err
  }

  if (!accounts.length) {
    throw new Error('No IBKR accounts found. Ensure you are logged in to the gateway.')
  }

  const accountId = accounts[0].accountId || accounts[0].id

  // 2. Fetch first page of positions (page index 0)
  const { data: rawPositions } = await client.get(`/v1/api/portfolio/${accountId}/positions/0`)
  const positions = Array.isArray(rawPositions) ? rawPositions : []

  return {
    accountId,
    positions: positions.map(pos => normalizePosition(pos, accountId)),
  }
}

function normalizePosition(pos, accountId) {
  return {
    accountId,
    conid: pos.conid,
    ticker: pos.ticker || pos.contractDesc || pos.name || '',
    name: pos.fullName || pos.contractDesc || pos.ticker || '',
    assetClass: pos.assetClass || 'STK',
    quantity: Number(pos.position ?? 0),
    marketPrice: Number(pos.mktPrice ?? 0),
    marketValue: Number(pos.mktValue ?? 0),
    currency: pos.currency || 'USD',
    avgCost: Number(pos.avgCost ?? 0),
    unrealizedPnl: Number(pos.unrealizedPnl ?? 0),
  }
}

export function getDemoPositions() {
  return {
    accountId: 'U123456',
    positions: [
      { accountId: 'U123456', conid: 265598, ticker: 'AAPL', name: 'Apple Inc.', assetClass: 'STK', quantity: 50, marketPrice: 189.5, marketValue: 9475, currency: 'USD', avgCost: 155.2, unrealizedPnl: 1665 },
      { accountId: 'U123456', conid: 272093, ticker: 'MSFT', name: 'Microsoft Corp.', assetClass: 'STK', quantity: 30, marketPrice: 415.2, marketValue: 12456, currency: 'USD', avgCost: 380, unrealizedPnl: 1056 },
      { accountId: 'U123456', conid: 208813720, ticker: 'NVDA', name: 'Nvidia Corp.', assetClass: 'STK', quantity: 20, marketPrice: 875.5, marketValue: 17510, currency: 'USD', avgCost: 500, unrealizedPnl: 7510 },
      { accountId: 'U123456', conid: 3691937, ticker: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'STK', quantity: 15, marketPrice: 165.3, marketValue: 2479.5, currency: 'USD', avgCost: 140, unrealizedPnl: 379.5 },
      { accountId: 'U123456', conid: 756733, ticker: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'STK', quantity: 25, marketPrice: 195.8, marketValue: 4895, currency: 'USD', avgCost: 170, unrealizedPnl: 645 },
      { accountId: 'U123456', conid: 9579970, ticker: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: 'STK', quantity: 40, marketPrice: 508.5, marketValue: 20340, currency: 'USD', avgCost: 450, unrealizedPnl: 2340 },
    ],
  }
}
