import { clearStoredSession } from '../auth/storage.js'

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include', // send httpOnly auth cookie automatically
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const error = await response.json()
      if (error?.error) {
        message = error.error
      }
    } catch {
      // Ignore JSON parse errors and keep the default message.
    }

    if (response.status === 401) {
      clearStoredSession()
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') {
      continue
    }
    params.set(key, String(value))
  }

  const search = params.toString()
  return search ? `${path}?${search}` : path
}

function normalizeAsset(asset) {
  return {
    ...asset,
    value: Number(asset.value || 0),
    cost: Number(asset.cost || 0),
    quantity: asset.quantity == null ? null : Number(asset.quantity),
    details: asset.details && typeof asset.details === 'object' ? asset.details : {},
  }
}

export async function registerUser(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutUser() {
  return request('/api/auth/logout', { method: 'POST' })
}

export async function fetchCurrentUser() {
  return request('/api/auth/me')
}

export async function updateProfile(payload) {
  return request('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function changePassword(payload) {
  return request('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteAccount(payload) {
  return request('/api/auth/account', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

export async function fetchAssets() {
  const response = await request('/api/assets')
  const assets = Array.isArray(response) ? response : response.items || []
  return assets.map(normalizeAsset)
}

export async function fetchAssetsPage(query = {}) {
  const response = await request(withQuery('/api/assets', query))
  const items = (response.items || []).map(normalizeAsset)

  return {
    items,
    pagination: response.pagination || {
      page: 1,
      pageSize: items.length,
      total: items.length,
      totalPages: 1,
    },
    filters: response.filters || {},
    sorting: response.sorting || {},
  }
}

export async function fetchPortfolioSummary() {
  return request('/api/portfolio/summary')
}

export async function fetchPortfolioHistory() {
  return request('/api/portfolio/history')
}

export async function fetchDashboardData() {
  try {
    const response = await request('/api/dashboard')
    const assets = Array.isArray(response?.assets) ? response.assets : []

    return {
      assets: assets.map(normalizeAsset),
      summary: response?.summary || null,
      history: Array.isArray(response?.history) ? response.history : [],
      prices: Array.isArray(response?.prices) ? response.prices : [],
    }
  } catch (error) {
    // Backward-compatible fallback when server does not yet expose /api/dashboard.
    if (!String(error?.message || '').includes('404')) {
      throw error
    }

    const [assets, summary, history, prices] = await Promise.all([
      fetchAssets(),
      fetchPortfolioSummary(),
      fetchPortfolioHistory(),
      fetchPrices(),
    ])

    return { assets, summary, history, prices }
  }
}

export async function fetchInsights(query = {}) {
  return request(withQuery('/api/insights', query))
}

export async function refreshPrices() {
  return request('/api/prices/refresh')
}

export async function fetchPrices() {
  return request('/api/prices')
}

export async function createAsset(payload) {
  return request('/api/assets', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateAsset(id, payload) {
  return request(`/api/assets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteAsset(id) {
  return request(`/api/assets/${id}`, {
    method: 'DELETE',
  })
}

// ── Wallet connections ────────────────────────────────────────
export async function fetchWalletConnections() {
  return request('/api/wallet/connections')
}

export async function saveWalletConnection(address, chainId = 1, label = null) {
  return request('/api/wallet/connections', {
    method: 'POST',
    body: JSON.stringify({ address, chainId, label }),
  })
}

export async function deleteWalletConnection(id) {
  return request(`/api/wallet/connections/${id}`, { method: 'DELETE' })
}

export async function fetchWalletBalances(address, chainId = 1) {
  return request(`/api/wallet/balances?address=${address}&chainId=${chainId}`)
}

export async function fetchWalletPortfolio(address) {
  return request(`/api/wallet/portfolio?address=${encodeURIComponent(address)}`)
}

// ── CEX (Coinbase) ─────────────────────────────────────────────
export async function fetchCoinbaseBalances(apiKey, apiSecret) {
  return request('/api/cex/coinbase/balances', {
    method: 'POST',
    body: JSON.stringify({ apiKey, apiSecret }),
  })
}

export async function fetchDemoBalances() {
  return request('/api/cex/demo/balances')
}

// ── Moomoo Singapore (Futu OpenAPI) ───────────────────────────
export async function fetchMoomooPositions(openDUrl) {
  return request('/api/moomoo/positions', {
    method: 'POST',
    body: JSON.stringify({ openDUrl }),
  })
}

export async function fetchMomooDemoPositions() {
  return request('/api/moomoo/demo/positions')
}

// ── IBKR Client Portal ────────────────────────────────────────
export async function fetchIbkrPositions(gatewayUrl) {
  return request('/api/ibkr/positions', {
    method: 'POST',
    body: JSON.stringify({ gatewayUrl }),
  })
}

export async function fetchIbkrDemoPositions() {
  return request('/api/ibkr/demo/positions')
}

// ── Live price lookup ─────────────────────────────────────────
export async function lookupPrice(symbol, type = 'stock') {
  return request(`/api/prices/lookup?symbol=${encodeURIComponent(symbol)}&type=${type}`)
}

// ── SnapTrade brokerage aggregation ──────────────────────────
export async function snaptradeRegister() {
  return request('/api/snaptrade/register', { method: 'POST' })
}

export async function snaptradeLogin() {
  return request('/api/snaptrade/login', { method: 'POST' })
}

export async function fetchSnaptradeHoldings() {
  return request('/api/snaptrade/holdings')
}

export async function fetchSnaptradeAccounts() {
  return request('/api/snaptrade/accounts')
}

export async function deleteSnaptradeUser() {
  return request('/api/snaptrade/user', { method: 'DELETE' })
}

export async function fetchSnaptradeDemoHoldings() {
  return request('/api/snaptrade/demo/holdings')
}

// ── UOB Open Banking ──────────────────────────────────────────
export async function fetchUobAccounts() {
  return request('/api/uob/accounts')
}

// ── AI Chat ───────────────────────────────────────────────────
export async function sendChatMessage(messages, portfolioContext = null) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, portfolioContext }),
  })
}

// ── OCBC Open API ─────────────────────────────────────────────
export async function connectOcbc() {
  return request('/api/ocbc/connect', { method: 'POST' })
}

export async function fetchOcbcAccounts() {
  return request('/api/ocbc/accounts')
}

export async function fetchOcbcStatus() {
  return request('/api/ocbc/status')
}

export async function disconnectOcbc() {
  return request('/api/ocbc/connection', { method: 'DELETE' })
}

export async function fetchSingpassAuthUrl() {
  return request('/api/singpass/auth-url')
}

export async function fetchSingpassData() {
  return request('/api/singpass/data')
}

export async function disconnectSingpass() {
  return request('/api/singpass/disconnect', { method: 'DELETE' })
}

export async function lookupPropertyByPostcode(postcode) {
  return request(`/api/property/lookup?postcode=${encodeURIComponent(postcode)}`)
}

export async function fetchOnboardingDemoLinks() {
  return request('/api/onboarding/demo-links')
}

export async function saveOnboardingDemoLinks(selectedProviders = [], metadataByProvider = {}) {
  return request('/api/onboarding/demo-links', {
    method: 'POST',
    body: JSON.stringify({ selectedProviders, metadataByProvider }),
  })
}
