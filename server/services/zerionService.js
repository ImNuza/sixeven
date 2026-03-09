import axios from 'axios'
import { resolveCoinGeckoId } from '../../shared/constants.js'

const ZERION_BASE = 'https://api.zerion.io/v1'

function getHeaders() {
  const key = process.env.ZERION_API_KEY
  if (!key) throw new Error('ZERION_API_KEY not configured')
  return {
    accept: 'application/json',
    authorization: `Basic ${Buffer.from(key + ':').toString('base64')}`,
  }
}

export async function fetchWalletPortfolio(address) {
  const url = `${ZERION_BASE}/wallets/${address}/positions/`
  const { data } = await axios.get(url, {
    headers: getHeaders(),
    params: {
      'filter[positions]': 'only_simple',
      currency: 'usd',
      'filter[trash]': 'only_non_trash',
      sort: 'value',
    },
    timeout: 15000,
  })
  return normalizeZerionPositions(data, address)
}

function normalizeZerionPositions(apiResponse, walletAddress) {
  const positions = apiResponse?.data || []
  return positions
    .map((pos) => {
      const attrs = pos.attributes || {}
      const fungible = attrs.fungible_info || {}
      const implementations = fungible.implementations || []
      const firstImpl = implementations[0] || {}

      const symbol = fungible.symbol || '???'
      const name = fungible.name || symbol
      const balance = attrs.quantity?.float || 0
      const valueUsd = attrs.value || 0
      const price = attrs.price || 0

      return {
        symbol,
        name,
        balance,
        valueUsd,
        price,
        chainId: firstImpl.chain_id || 'ethereum',
        contractAddress: firstImpl.address || null,
        logo: fungible.icon?.url || null,
        coingeckoId: resolveCoinGeckoId(symbol),
      }
    })
    .filter((t) => t.valueUsd > 0.01)
}

export function isZerionConfigured() {
  return !!process.env.ZERION_API_KEY
}
