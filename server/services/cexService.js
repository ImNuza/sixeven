import crypto from 'crypto'
import axios from 'axios'
import { resolveCoinGeckoId } from '../../shared/constants.js'

const COINBASE_BASE = 'https://api.coinbase.com'

// ── Legacy API key auth (CB-ACCESS-KEY style) ──
function signRequestLegacy(timestamp, method, path, body, secret) {
  const message = timestamp + method.toUpperCase() + path + (body || '')
  return crypto.createHmac('sha256', secret).update(message).digest('base64')
}

// ── CDP API key auth (organizations/... style, ES256 JWT) ──
function buildCdpJwt(apiKeyName, privateKeyPem, requestMethod, requestPath) {
  const header = { alg: 'ES256', kid: apiKeyName, nonce: crypto.randomBytes(16).toString('hex'), typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const uri = `${requestMethod} api.coinbase.com${requestPath}`
  const payload = { sub: apiKeyName, iss: 'cdp', iat: now, nbf: now, exp: now + 120, uris: [uri] }

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = encode(header) + '.' + encode(payload)

  const cleanPem = privateKeyPem.replace(/\\n/g, '\n').trim()
  const sign = crypto.createSign('SHA256')
  sign.update(unsigned)
  const sig = sign.sign(cleanPem, 'base64url')

  return unsigned + '.' + sig
}

function isCdpKey(apiKey) {
  return apiKey.startsWith('organizations/')
}

export async function fetchCoinbaseBalances(apiKey, apiSecret) {
  if (isCdpKey(apiKey)) {
    return fetchCdpBalances(apiKey, apiSecret)
  }
  return fetchLegacyBalances(apiKey, apiSecret)
}

// ── CDP key: uses v3 brokerage API with JWT ──
async function fetchCdpBalances(apiKey, apiSecret) {
  const path = '/api/v3/brokerage/accounts'
  const jwt = buildCdpJwt(apiKey, apiSecret, 'GET', path)

  const { data } = await axios.get(`${COINBASE_BASE}${path}?limit=250`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  })

  return (data.accounts || [])
    .filter((account) => {
      const balance = parseFloat(account.available_balance?.value || '0')
      return balance > 0
    })
    .map((account) => {
      const symbol = account.currency || '???'
      const balance = parseFloat(account.available_balance?.value || '0')

      return {
        symbol,
        name: account.name || symbol,
        balance,
        nativeValue: 0,
        nativeCurrency: 'USD',
        coingeckoId: resolveCoinGeckoId(symbol),
        type: account.type || 'wallet',
      }
    })
}

// ── Legacy key: uses v2 API with HMAC ──
async function fetchLegacyBalances(apiKey, apiSecret) {
  const path = '/v2/accounts?limit=100'
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signRequestLegacy(timestamp, 'GET', path, '', apiSecret)

  const { data } = await axios.get(`${COINBASE_BASE}${path}`, {
    headers: {
      'CB-ACCESS-KEY': apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-VERSION': '2024-01-01',
    },
    timeout: 15000,
  })

  return (data.data || [])
    .filter((account) => {
      const balance = parseFloat(account.balance?.amount || '0')
      return balance > 0
    })
    .map((account) => {
      const symbol = account.balance?.currency || account.currency?.code || '???'
      const balance = parseFloat(account.balance?.amount || '0')
      const nativeValue = parseFloat(account.native_balance?.amount || '0')

      return {
        symbol,
        name: account.currency?.name || account.name || symbol,
        balance,
        nativeValue,
        nativeCurrency: account.native_balance?.currency || 'USD',
        coingeckoId: resolveCoinGeckoId(symbol),
        type: account.type || 'wallet',
      }
    })
}

export function getDemoBalances() {
  return [
    { symbol: 'BTC', name: 'Bitcoin', balance: 0.25, nativeValue: 23750, nativeCurrency: 'USD', coingeckoId: 'bitcoin', type: 'wallet' },
    { symbol: 'ETH', name: 'Ethereum', balance: 3.5, nativeValue: 10850, nativeCurrency: 'USD', coingeckoId: 'ethereum', type: 'wallet' },
    { symbol: 'SOL', name: 'Solana', balance: 45.0, nativeValue: 6300, nativeCurrency: 'USD', coingeckoId: 'solana', type: 'wallet' },
    { symbol: 'USDC', name: 'USD Coin', balance: 5000, nativeValue: 5000, nativeCurrency: 'USD', coingeckoId: 'usd-coin', type: 'wallet' },
    { symbol: 'LINK', name: 'Chainlink', balance: 150, nativeValue: 2250, nativeCurrency: 'USD', coingeckoId: 'chainlink', type: 'wallet' },
    { symbol: 'DOT', name: 'Polkadot', balance: 200, nativeValue: 1400, nativeCurrency: 'USD', coingeckoId: 'polkadot', type: 'wallet' },
    { symbol: 'AVAX', name: 'Avalanche', balance: 60, nativeValue: 1320, nativeCurrency: 'USD', coingeckoId: 'avalanche-2', type: 'wallet' },
    { symbol: 'ADA', name: 'Cardano', balance: 3000, nativeValue: 1200, nativeCurrency: 'USD', coingeckoId: 'cardano', type: 'wallet' },
  ]
}
