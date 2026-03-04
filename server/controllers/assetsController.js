import {
  buildAssetListQueryParts,
  buildAssetOrderClause,
  parseAssetListQuery,
  validateAssetPayload,
} from '../validation/assetsValidation.js'

function normalizeAssetPayload(body = {}) {
  return {
    name: body.name,
    category: body.category,
    ticker: body.ticker || null,
    value: body.value,
    cost: body.cost,
    quantity: body.quantity ?? null,
    date: body.date,
    institution: body.institution || null,
    details: body.details && typeof body.details === 'object' ? body.details : {},
  }
}

function prependUserFilter(whereClause) {
  if (!whereClause) {
    return 'WHERE user_id = $1'
  }

  return whereClause.replace('WHERE', 'WHERE user_id = $1 AND')
}

export function createAssetsController({ pool, recordNetWorthSnapshot }) {
  return {
    listAssets: async (req, res) => {
      try {
        const filters = parseAssetListQuery(req.query)
        const { whereClause, params } = buildAssetListQueryParts(filters)
        const scopedWhereClause = prependUserFilter(whereClause)
        const queryParams = [req.user.id, ...params]
        const orderClause = buildAssetOrderClause(filters.sortBy, filters.sortDirection)
        const offset = (filters.page - 1) * filters.pageSize

        const countResult = await pool.query(
          `SELECT COUNT(*) AS total FROM assets ${scopedWhereClause}`,
          queryParams
        )

        const rowsResult = await pool.query(
          `SELECT * FROM assets ${scopedWhereClause} ${orderClause} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
          [...queryParams, filters.pageSize, offset]
        )

        const total = Number(countResult.rows[0]?.total || 0)
        const totalPages = Math.max(1, Math.ceil(total / filters.pageSize))

        res.json({
          items: rowsResult.rows,
          pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            total,
            totalPages,
          },
          filters: {
            search: filters.search,
            category: filters.category,
            pricing: filters.pricing,
          },
          sorting: {
            sortBy: filters.sortBy,
            sortDirection: filters.sortDirection.toLowerCase(),
          },
        })
      } catch (err) {
        res.status(500).json({ error: err.message })
      }
    },

    createAsset: async (req, res) => {
      const { name, category, ticker, value, cost, quantity, date, institution, details } = normalizeAssetPayload(req.body)
      const errors = validateAssetPayload({ name, category, ticker, value, cost, quantity, date, institution, details })
      if (errors.length) {
        return res.status(400).json({ error: errors[0], details: errors })
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(
          `INSERT INTO assets (user_id, name, category, ticker, value, cost, quantity, date, institution, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [req.user.id, name, category, ticker, value, cost, quantity, date, institution, details]
        )
        await recordNetWorthSnapshot(req.user.id, 'asset_create', client)
        await client.query('COMMIT')
        res.status(201).json(rows[0])
      } catch (err) {
        await client.query('ROLLBACK')
        res.status(500).json({ error: err.message })
      } finally {
        client.release()
      }
    },

    updateAsset: async (req, res) => {
      const { id } = req.params
      const { name, category, ticker, value, cost, quantity, date, institution, details } = normalizeAssetPayload(req.body)
      const errors = validateAssetPayload({ name, category, ticker, value, cost, quantity, date, institution, details })
      if (errors.length) {
        return res.status(400).json({ error: errors[0], details: errors })
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(
          `UPDATE assets
           SET name=$1, category=$2, ticker=$3, value=$4, cost=$5,
               quantity=$6, date=$7, institution=$8, details=$9
           WHERE id=$10 AND user_id=$11
           RETURNING *`,
          [name, category, ticker, value, cost, quantity, date, institution, details, id, req.user.id]
        )
        if (!rows.length) {
          await client.query('ROLLBACK')
          return res.status(404).json({ error: 'Asset not found' })
        }

        await recordNetWorthSnapshot(req.user.id, 'asset_update', client)
        await client.query('COMMIT')
        res.json(rows[0])
      } catch (err) {
        await client.query('ROLLBACK')
        res.status(500).json({ error: err.message })
      } finally {
        client.release()
      }
    },

    deleteAsset: async (req, res) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          'DELETE FROM assets WHERE id = $1 AND user_id = $2',
          [req.params.id, req.user.id]
        )
        if (!result.rowCount) {
          await client.query('ROLLBACK')
          return res.status(404).json({ error: 'Asset not found' })
        }

        await recordNetWorthSnapshot(req.user.id, 'asset_delete', client)
        await client.query('COMMIT')
        res.status(204).send()
      } catch (err) {
        await client.query('ROLLBACK')
        res.status(500).json({ error: err.message })
      } finally {
        client.release()
      }
    },
  }
}
