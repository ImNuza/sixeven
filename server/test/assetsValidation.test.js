import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAssetPayload } from '../validation/assetsValidation.js'

test('validateAssetPayload allows manual crypto and stock entries without live pricing fields', () => {
  const cryptoErrors = validateAssetPayload({
    name: 'Crypto Portfolio',
    category: 'CRYPTO',
    value: 12000,
    cost: 12000,
    date: '2026-03-09',
    details: {},
  })

  const stockErrors = validateAssetPayload({
    name: 'Stocks Portfolio',
    category: 'STOCKS',
    value: 45000,
    cost: 45000,
    date: '2026-03-09',
    details: {},
  })

  assert.deepEqual(cryptoErrors, [])
  assert.deepEqual(stockErrors, [])
})

test('validateAssetPayload still requires both ticker and quantity for live-priced entries', () => {
  const errors = validateAssetPayload({
    name: 'Bitcoin',
    category: 'CRYPTO',
    ticker: 'BTC',
    value: 12000,
    cost: 9000,
    date: '2026-03-09',
    details: {},
  })

  assert.match(errors[0], /quantity/i)
})
