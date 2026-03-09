import crypto from 'crypto'
import axios from 'axios'
import { resolveCoinGeckoId } from '../../shared/constants.js'

const COINBASE_BASE = 'https://api.coinbase.com'

function signRequest(timestamp, method, path, body, secret) {
  const message = timestamp + method.toUpperCase() + path + (body || '')
  return crypto.createHmac('sha256', secret).update(message).digest('base64')
}

export async function fetchCoinbaseBalances(apiKey, apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const method = 'GET'
  const path = '/v2/accounts?limit=100'
  const signature = signRequest(timestamp, method, path, '', apiSecret)

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
