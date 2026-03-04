import { pool } from '../db.js'

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits))
}

export async function recordNetWorthSnapshot(source = 'system', client = pool) {
  const { rows } = await client.query(
    'SELECT COALESCE(SUM(value), 0) AS total_value FROM assets'
  )
  const totalValue = round(rows[0]?.total_value || 0)

  const insertResult = await client.query(
    `INSERT INTO net_worth_snapshots (value, snapshot_date, source)
     VALUES ($1, CURRENT_DATE, $2)
     RETURNING id, value, snapshot_date, source, created_at`,
    [totalValue, source]
  )

  return insertResult.rows[0]
}

export async function getPortfolioSummary(client = pool) {
  const { rows: assets } = await client.query('SELECT value, cost FROM assets')
  const totalValue = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0)
  const totalCost = assets.reduce((sum, asset) => sum + Number(asset.cost || 0), 0)

  const { rows: snapshots } = await client.query(
    `SELECT value
     FROM net_worth_snapshots
     WHERE snapshot_date < date_trunc('month', CURRENT_DATE)::date
     ORDER BY snapshot_date DESC, created_at DESC
     LIMIT 1`
  )

  const previousValue = snapshots[0] ? Number(snapshots[0].value) : totalValue
  const monthlyChange = totalValue - previousValue
  const monthlyChangePct = previousValue > 0 ? (monthlyChange / previousValue) * 100 : 0
  const totalGainLoss = totalValue - totalCost
  const gainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0

  return {
    totalNetWorth: round(totalValue),
    totalCost: round(totalCost),
    totalGainLoss: round(totalGainLoss),
    gainLossPct: round(gainLossPct, 1),
    monthlyChange: round(monthlyChange),
    monthlyChangePct: round(monthlyChangePct, 1),
  }
}

export async function getPortfolioHistory(client = pool) {
  const { rows } = await client.query(
    `SELECT value, snapshot_date, source, created_at
     FROM net_worth_snapshots
     ORDER BY snapshot_date ASC, created_at ASC`
  )

  return rows.map((row) => {
    const createdAt = new Date(row.created_at)
    const snapshotDate = new Date(row.snapshot_date)
    const label = row.source === 'seed'
      ? snapshotDate.toLocaleDateString('en-SG', {
          month: 'short',
          year: 'numeric',
        })
      : createdAt.toLocaleString('en-SG', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })

    return {
      month: label,
      value: Number(row.value),
      source: row.source,
      snapshotDate: row.snapshot_date,
      createdAt: row.created_at,
    }
  })
}
