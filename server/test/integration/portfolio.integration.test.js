import test from 'node:test'
import assert from 'node:assert/strict'
import { createTempDatabase } from './tempDatabase.js'
import { createApp } from '../../app.js'
import {
  authenticateAccount,
  changePassword,
  createUserAccount,
  deleteAccount,
  getUserById,
  updateProfile,
} from '../../services/accountService.js'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from '../../services/portfolioService.js'

async function startTestServer(pool) {
  const app = createApp({
    pool,
    ensureFreshPrices: async () => ({ refreshed: false }),
    refreshUserPrices: async () => ({ refreshed: true }),
    getPortfolioSummary: (userId) => getPortfolioSummary(userId, pool),
    getPortfolioHistory: (userId) => getPortfolioHistory(userId, pool),
    recordNetWorthSnapshot: (userId, source, client) => recordNetWorthSnapshot(userId, source, client),
    createUserAccount,
    authenticateAccount,
    getUserById,
    changePassword,
    deleteAccount,
    updateProfile,
  })

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address()
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      })
    })
  })
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  return { response, body }
}

async function registerUser(baseUrl, username) {
  const registerResult = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
    }),
  })

  assert.equal(registerResult.response.status, 201)
  return registerResult.body
}

test('integration: portfolio history returns seeded snapshots for a registered account', async () => {
  const database = await createTempDatabase()
  const { server, baseUrl } = await startTestServer(database.pool)

  try {
    const session = await registerUser(baseUrl, 'history_user')

    const historyResult = await request(baseUrl, '/api/portfolio/history', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    assert.equal(historyResult.response.status, 200)
    assert.equal(historyResult.body.length, 6)
    assert.equal(historyResult.body[0].source, 'seed')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await database.cleanup()
  }
})

test('integration: creating an asset appends a snapshot that appears in portfolio history', async () => {
  const database = await createTempDatabase()
  const { server, baseUrl } = await startTestServer(database.pool)

  try {
    const session = await registerUser(baseUrl, 'snapshot_user')

    const historyBefore = await request(baseUrl, '/api/portfolio/history', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    const createAssetResult = await request(baseUrl, '/api/assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        name: 'Cash Reserve',
        category: 'CASH',
        value: 1200,
        cost: 1200,
        date: '2026-03-05',
        institution: 'DBS',
        details: {},
      }),
    })

    assert.equal(createAssetResult.response.status, 201)

    const historyAfter = await request(baseUrl, '/api/portfolio/history', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    assert.equal(historyAfter.response.status, 200)
    assert.equal(historyAfter.body.length, historyBefore.body.length + 1)
    assert.equal(historyAfter.body.at(-1).source, 'asset_create')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await database.cleanup()
  }
})

test('integration: auth login and me return the registered account', async () => {
  const database = await createTempDatabase()
  const { server, baseUrl } = await startTestServer(database.pool)

  try {
    const session = await registerUser(baseUrl, 'auth_user')

    const loginResult = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'auth_user',
        password: 'password123',
      }),
    })

    assert.equal(loginResult.response.status, 200)
    assert.equal(loginResult.body.user.username, 'auth_user')

    const meResult = await request(baseUrl, '/api/auth/me', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    assert.equal(meResult.response.status, 200)
    assert.equal(meResult.body.user.username, 'auth_user')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await database.cleanup()
  }
})

test('integration: prices route is authenticated and returns joined price rows', async () => {
  const database = await createTempDatabase()
  const { server, baseUrl } = await startTestServer(database.pool)

  try {
    const session = await registerUser(baseUrl, 'price_user')

    const unauthenticatedResult = await request(baseUrl, '/api/prices')
    assert.equal(unauthenticatedResult.response.status, 401)

    const { rows } = await database.pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['price_user']
    )
    const userId = rows[0].id

    await database.pool.query(
      `INSERT INTO price_cache (symbol, price_usd, price_sgd, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      ['AAPL', 185, 250]
    )

    await database.pool.query(
      `INSERT INTO assets (user_id, name, category, ticker, value, cost, quantity, date, institution, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb)`,
      [userId, 'Apple Position', 'STOCKS', 'AAPL', 2500, 2200, 10, '2026-03-05', 'Broker']
    )

    const pricesResult = await request(baseUrl, '/api/prices', {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    assert.equal(pricesResult.response.status, 200)
    assert.equal(pricesResult.body.length, 1)
    assert.equal(pricesResult.body[0].symbol, 'AAPL')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await database.cleanup()
  }
})
