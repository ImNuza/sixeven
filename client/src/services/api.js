async function request(path, options = {}) {
  const response = await fetch(path, {
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

    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
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

export async function fetchAssets() {
  const assets = await request('/api/assets')
  return assets.map(normalizeAsset)
}

export async function fetchPortfolioSummary() {
  return request('/api/portfolio/summary')
}

export async function fetchPortfolioHistory() {
  return request('/api/portfolio/history')
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
