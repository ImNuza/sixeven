import axios from 'axios'
import crypto from 'crypto'

const BASE_URL = 'https://api.snaptrade.com/api/v1'

function getConfig() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY
  if (!clientId || !consumerKey) throw new Error('SnapTrade not configured')
  return { clientId, consumerKey }
}

export function isSnapTradeConfigured() {
  return !!(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY)
}

function buildSignature(consumerKey, path, body, timestamp) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const content = path + bodyStr + timestamp
  return crypto.createHmac('sha256', consumerKey).update(content).digest('hex')
}

async function snapRequest(method, path, { queryParams = {}, body = null } = {}) {
  const { clientId, consumerKey } = getConfig()
  const timestamp = Date.now()
  const sig = buildSignature(consumerKey, path, body, timestamp)

  const params = { clientId, timestamp, ...queryParams }

  const { data } = await axios({
    method,
    url: BASE_URL + path,
    params,
    data: body !== null ? body : undefined,
    headers: {
      'Content-Type': 'application/json',
      Signature: sig,
    },
    timeout: 15000,
  })

  return data
}

export async function registerUser(snapUserId) {
  return snapRequest('POST', '/snapTrade/registerUser', {
    body: { userId: snapUserId },
  })
}

export async function deleteUser(snapUserId, userSecret) {
  return snapRequest('DELETE', '/snapTrade/deleteUser', {
    queryParams: { userId: snapUserId, userSecret },
  })
}

export async function getLoginUrl(snapUserId, userSecret) {
  return snapRequest('POST', '/snapTrade/login', {
    queryParams: { userId: snapUserId, userSecret },
    body: {},
  })
}

export async function getAccounts(snapUserId, userSecret) {
  return snapRequest('GET', '/accounts', {
    queryParams: { userId: snapUserId, userSecret },
  })
}

export async function getHoldings(snapUserId, userSecret) {
  return snapRequest('GET', '/holdings', {
    queryParams: { userId: snapUserId, userSecret },
  })
}

export function getDemoHoldings() {
  return [
    {
      account: {
        id: 'demo-acc-1',
        number: 'DEMO001',
        name: 'Demo Brokerage Account',
        institution_name: 'SnapTrade Demo Broker',
      },
      positions: [
        {
          symbol: { symbol: 'AAPL', description: 'Apple Inc.', type: 'equity' },
          units: 50,
          price: 189.5,
          open_pnl: 1665,
          average_purchase_price: 155.2,
          currency: { code: 'USD' },
        },
        {
          symbol: { symbol: 'MSFT', description: 'Microsoft Corp.', type: 'equity' },
          units: 30,
          price: 415.2,
          open_pnl: 1056,
          average_purchase_price: 380.0,
          currency: { code: 'USD' },
        },
        {
          symbol: { symbol: 'NVDA', description: 'Nvidia Corp.', type: 'equity' },
          units: 20,
          price: 875.5,
          open_pnl: 7510,
          average_purchase_price: 500.0,
          currency: { code: 'USD' },
        },
        {
          symbol: { symbol: 'SPY', description: 'SPDR S&P 500 ETF Trust', type: 'equity' },
          units: 40,
          price: 508.5,
          open_pnl: 2340,
          average_purchase_price: 450.0,
          currency: { code: 'USD' },
        },
        {
          symbol: { symbol: 'AGG', description: 'iShares Core US Aggregate Bond ETF', type: 'equity' },
          units: 60,
          price: 95.8,
          open_pnl: -120,
          average_purchase_price: 97.8,
          currency: { code: 'USD' },
        },
        {
          symbol: { symbol: 'BND', description: 'Vanguard Total Bond Market ETF', type: 'equity' },
          units: 100,
          price: 73.2,
          open_pnl: 420,
          average_purchase_price: 68.9,
          currency: { code: 'USD' },
        },
      ],
    },
  ]
}
