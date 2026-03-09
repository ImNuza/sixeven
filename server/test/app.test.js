import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssetsController } from '../controllers/assetsController.js'

function createMockPool() {
  const state = {
    nextId: 2,
    assets: [
      {
        id: 1,
        user_id: 7,
        name: 'DBS Savings Account',
        category: 'CASH',
        ticker: null,
        value: 15000,
        cost: 15000,
        quantity: null,
        date: '2020-01-01',
        institution: 'DBS',
        details: {},
      },
    ],
    snapshots: [],
  }

  function userAssets(userId) {
    return state.assets.filter((asset) => Number(asset.user_id) === Number(userId))
  }

  function sumAssets(userId) {
    return userAssets(userId).reduce((sum, asset) => sum + Number(asset.value || 0), 0)
  }

  async function execute(sql, params = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 }
    }

    if (sql.includes('SELECT COUNT(*) AS total FROM assets')) {
      const scopedAssets = userAssets(params[0])
      return { rows: [{ total: String(scopedAssets.length) }] }
    }

    if (sql.includes('SELECT * FROM assets') && sql.includes('LIMIT')) {
      const userId = params[0]
      const limit = Number(params[params.length - 2])
      const offset = Number(params[params.length - 1])
      return {
        rows: [...userAssets(userId)]
          .sort((a, b) => b.value - a.value)
          .slice(offset, offset + limit),
      }
    }

    if (sql.includes('INSERT INTO assets')) {
      const asset = {
        id: state.nextId++,
        user_id: Number(params[0]),
        name: params[1],
        category: params[2],
        ticker: params[3],
        value: Number(params[4]),
        cost: Number(params[5]),
        quantity: params[6] == null ? null : Number(params[6]),
        date: params[7],
        institution: params[8],
        details: params[9] || {},
      }
      state.assets.push(asset)
      return { rows: [asset], rowCount: 1 }
    }

    if (sql.includes('UPDATE assets')) {
      const id = Number(params[9])
      const userId = Number(params[10])
      const asset = state.assets.find((item) => item.id === id && Number(item.user_id) === userId)
      if (!asset) {
        return { rows: [], rowCount: 0 }
      }

      Object.assign(asset, {
        name: params[0],
        category: params[1],
        ticker: params[2],
        value: Number(params[3]),
        cost: Number(params[4]),
        quantity: params[5] == null ? null : Number(params[5]),
        date: params[6],
        institution: params[7],
        details: params[8] || {},
      })
      return { rows: [asset], rowCount: 1 }
    }

    if (sql.includes('DELETE FROM assets WHERE id = $1 AND user_id = $2')) {
      const id = Number(params[0])
      const userId = Number(params[1])
      const index = state.assets.findIndex((item) => item.id === id && Number(item.user_id) === userId)
      if (index === -1) {
        return { rows: [], rowCount: 0 }
      }

      state.assets.splice(index, 1)
      return { rows: [], rowCount: 1 }
    }

    if (sql.includes('SELECT COALESCE(SUM(value), 0) AS total_value FROM assets')) {
      return { rows: [{ total_value: String(sumAssets(params[0])) }] }
    }

    if (sql.includes('INSERT INTO net_worth_snapshots')) {
      const snapshot = {
        id: state.snapshots.length + 1,
        user_id: Number(params[0]),
        value: Number(params[1]),
        snapshot_date: '2026-03-05',
        source: params[2],
        created_at: `2026-03-05T04:00:0${state.snapshots.length}.000Z`,
      }
      state.snapshots.push(snapshot)
      return { rows: [snapshot], rowCount: 1 }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    state,
    async query(sql, params) {
      return execute(sql, params)
    },
    async connect() {
      return {
        query: execute,
        release() {},
      }
    },
  }
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    sent: false,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      this.sent = true
      return this
    },
    send(payload) {
      this.body = payload
      this.sent = true
      return this
    },
  }
}

test('asset CRUD routes persist detail metadata and record scoped snapshots', async () => {
  const pool = createMockPool()
  const controller = createAssetsController({
    pool,
    recordNetWorthSnapshot: async (userId, source, client) => {
      await client.query(
        `INSERT INTO net_worth_snapshots (user_id, value, snapshot_date, source)
         VALUES ($1, $2, CURRENT_DATE, $3)
         RETURNING id, user_id, value, snapshot_date, source, created_at`,
        [userId, pool.state.assets.reduce((sum, asset) => sum + Number(asset.value), 0), source]
      )
    },
  })

  const createReq = {
    user: { id: 7 },
    body: {
      name: 'CPF Special Account',
      category: 'CPF',
      value: 25000,
      cost: 25000,
      date: '2026-03-05',
      institution: 'CPF Board',
      details: {
        accountType: 'SA',
        annualInterestRate: '4.0',
      },
    },
  }
  const createRes = createMockResponse()
  await controller.createAsset(createReq, createRes)

  assert.equal(createRes.statusCode, 201)
  assert.equal(createRes.body.user_id, 7)
  assert.equal(createRes.body.details.accountType, 'SA')

  const updateReq = {
    user: { id: 7 },
    params: { id: String(createRes.body.id) },
    body: {
      ...createRes.body,
      value: 26000,
      details: {
        accountType: 'SA',
        annualInterestRate: '4.1',
      },
    },
  }
  const updateRes = createMockResponse()
  await controller.updateAsset(updateReq, updateRes)

  assert.equal(updateRes.statusCode, 200)
  assert.equal(updateRes.body.value, 26000)
  assert.equal(updateRes.body.details.annualInterestRate, '4.1')

  const deleteReq = {
    user: { id: 7 },
    params: { id: String(createRes.body.id) },
  }
  const deleteRes = createMockResponse()
  await controller.deleteAsset(deleteReq, deleteRes)

  assert.equal(deleteRes.statusCode, 204)
  assert.deepEqual(
    pool.state.snapshots.map((snapshot) => snapshot.source),
    ['asset_create', 'asset_update', 'asset_delete']
  )
})

test('updating another users asset returns 404', async () => {
  const pool = createMockPool()
  pool.state.assets.push({
    id: 2,
    user_id: 99,
    name: 'Private Asset',
    category: 'CASH',
    ticker: null,
    value: 5,
    cost: 5,
    quantity: null,
    date: '2026-03-05',
    institution: null,
    details: {},
  })

  const controller = createAssetsController({
    pool,
    recordNetWorthSnapshot: async () => {},
  })

  const req = {
    user: { id: 7 },
    params: { id: '2' },
    body: {
      name: 'Missing Asset',
      category: 'CASH',
      value: 1,
      cost: 1,
      date: '2026-03-05',
      details: {},
    },
  }
  const res = createMockResponse()

  await controller.updateAsset(req, res)

  assert.equal(res.statusCode, 404)
  assert.deepEqual(pool.state.snapshots, [])
})

test('listAssets returns pagination metadata for backend-driven tables', async () => {
  const pool = createMockPool()
  pool.state.assets.push(
    {
      id: 2,
      user_id: 7,
      name: 'Bitcoin',
      category: 'CRYPTO',
      ticker: 'bitcoin',
      value: 20000,
      cost: 12000,
      quantity: 0.2,
      date: '2020-01-01',
      institution: 'Ledger',
      details: {},
    },
    {
      id: 3,
      user_id: 7,
      name: 'Condo',
      category: 'PROPERTY',
      ticker: null,
      value: 450000,
      cost: 380000,
      quantity: null,
      date: '2020-01-01',
      institution: 'Private',
      details: {},
    }
  )

  const controller = createAssetsController({
    pool,
    recordNetWorthSnapshot: async () => {},
  })

  const req = {
    user: { id: 7 },
    query: {
      page: '1',
      pageSize: '2',
      sortBy: 'value',
      sortDirection: 'desc',
      category: 'ALL',
      pricing: 'ALL',
      search: '',
    },
  }
  const res = createMockResponse()

  await controller.listAssets(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.pagination.total, 3)
  assert.equal(res.body.pagination.pageSize, 2)
  assert.equal(res.body.items.length, 2)
})

test('createAsset rejects invalid cross-field payloads before touching the database', async () => {
  const pool = createMockPool()
  const controller = createAssetsController({
    pool,
    recordNetWorthSnapshot: async () => {
      throw new Error('should not be called')
    },
  })

  const req = {
    user: { id: 7 },
    body: {
      name: 'Bond Holding',
      category: 'BONDS',
      value: 100,
      cost: 100,
      date: '2026-03-05',
      details: {
        issuer: 'MAS',
        couponRate: '3.0',
        maturityDate: '2020-01-01',
      },
    },
  }
  const res = createMockResponse()

  await controller.createAsset(req, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /future/i)
})
