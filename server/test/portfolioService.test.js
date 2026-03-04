import test from 'node:test'
import assert from 'node:assert/strict'
import { getPortfolioHistory, getPortfolioSummary, recordNetWorthSnapshot } from '../services/portfolioService.js'

test('recordNetWorthSnapshot stores the current total with the provided source', async () => {
  const calls = []
  const client = {
    async query(sql, params) {
      calls.push({ sql, params })

      if (sql.includes('SELECT COALESCE(SUM(value), 0) AS total_value FROM assets')) {
        return { rows: [{ total_value: '125000.456' }] }
      }

      if (sql.includes('INSERT INTO net_worth_snapshots')) {
        return {
          rows: [{
            id: 7,
            user_id: params[0],
            value: 125000.46,
            snapshot_date: '2026-03-05',
            source: params[2],
            created_at: '2026-03-05T04:00:00.000Z',
          }],
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const snapshot = await recordNetWorthSnapshot(9, 'asset_update', client)

  assert.equal(snapshot.value, 125000.46)
  assert.equal(snapshot.user_id, 9)
  assert.equal(snapshot.source, 'asset_update')
  assert.equal(calls.length, 2)
})

test('getPortfolioSummary computes calendar monthly change from prior-month snapshots', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('SELECT value, cost FROM assets')) {
        return {
          rows: [
            { value: '100000', cost: '90000' },
            { value: '25000', cost: '20000' },
          ],
        }
      }

      if (sql.includes('FROM net_worth_snapshots')) {
        return { rows: [{ value: '110000' }] }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const summary = await getPortfolioSummary(9, client)

  assert.deepEqual(summary, {
    totalNetWorth: 125000,
    totalCost: 110000,
    totalGainLoss: 15000,
    gainLossPct: 13.6,
    monthlyChange: 15000,
    monthlyChangePct: 13.6,
  })
})

test('getPortfolioHistory preserves seed month labels and event timestamps', async () => {
  const client = {
    async query() {
      return {
        rows: [
          {
            value: '1000',
            snapshot_date: '2026-01-31',
            source: 'seed',
            created_at: '2026-03-05T04:00:00.000Z',
          },
          {
            value: '1050',
            snapshot_date: '2026-03-05',
            source: 'manual_refresh',
            created_at: '2026-03-05T04:05:00.000Z',
          },
        ],
      }
    },
  }

  const history = await getPortfolioHistory(9, client)

  assert.equal(history[0].month, 'Jan 2026')
  assert.equal(history[0].source, 'seed')
  assert.match(history[1].month, /05 Mar|Mar 05|05\/03/)
  assert.equal(history[1].source, 'manual_refresh')
})
