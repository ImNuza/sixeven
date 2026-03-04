import { buildPortfolioInsights } from '../../shared/portfolioInsights.js'

function normalizeAssetRow(asset) {
  return {
    ...asset,
    value: Number(asset.value || 0),
    cost: Number(asset.cost || 0),
    quantity: asset.quantity == null ? null : Number(asset.quantity),
    details: asset.details && typeof asset.details === 'object' ? asset.details : {},
  }
}

function parseInsightsQuery(query = {}) {
  const focus = String(query.focus || 'ALL').toUpperCase()
  const highlight = String(query.highlight || 'ALL').toLowerCase()
  const moveSort = String(query.moveSort || 'impact').toLowerCase()
  const moveDirection = String(query.moveDirection || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
  const movePage = clampInt(query.movePage, 1, 1)
  const movePageSize = clampInt(query.movePageSize, 5, 1, 20)

  return {
    focus: ['ALL', 'CPF', 'PROPERTY', 'BONDS'].includes(focus) ? focus : 'ALL',
    highlight: ['all', 'warning', 'positive', 'info'].includes(highlight) ? highlight : 'all',
    moveSort: ['impact', 'gain', 'name'].includes(moveSort) ? moveSort : 'impact',
    moveDirection,
    movePage,
    movePageSize,
  }
}

function filterAnalytics(cards, focus) {
  if (focus === 'ALL') {
    return cards
  }

  const keyMap = {
    CPF: 'cpf',
    PROPERTY: 'property',
    BONDS: 'bonds',
  }

  return cards.filter((card) => card.key === keyMap[focus])
}

function filterHighlights(highlights, highlight) {
  if (highlight === 'all') {
    return highlights
  }

  return highlights.filter((item) => item.type === highlight)
}

function sortAssetMoves(moves, moveSort, moveDirection) {
  const sorted = [...moves].sort((left, right) => {
    if (moveSort === 'gain') {
      return left.gain - right.gain
    }

    if (moveSort === 'name') {
      return left.name.localeCompare(right.name)
    }

    return Math.abs(left.gain) - Math.abs(right.gain)
  })

  if (moveDirection === 'desc') {
    sorted.reverse()
  }

  return sorted
}

function filterMovesByFocus(moves, focus) {
  if (focus === 'ALL') {
    return moves
  }

  return moves.filter((move) => move.category === focus)
}

export async function getInsightsPayload({ pool, userId, getPortfolioSummary, query }) {
  const filters = parseInsightsQuery(query)
  const [assetResult, summary, priceResult] = await Promise.all([
    pool.query(
      `SELECT *
       FROM assets
       WHERE user_id = $1
       ORDER BY value DESC, name ASC`,
      [userId]
    ),
    getPortfolioSummary(userId),
    pool.query(
      `SELECT DISTINCT pc.*
       FROM price_cache pc
       INNER JOIN assets a ON a.ticker = pc.symbol
       WHERE a.user_id = $1
       ORDER BY pc.updated_at DESC`,
      [userId]
    ),
  ])

  const assets = assetResult.rows.map(normalizeAssetRow)
  const prices = priceResult.rows
  const insights = buildPortfolioInsights(assets, summary, prices)
  const moveRows = sortAssetMoves(
    filterMovesByFocus(insights.assetMoves, filters.focus),
    filters.moveSort,
    filters.moveDirection
  )
  const moveOffset = (filters.movePage - 1) * filters.movePageSize
  const moveItems = moveRows.slice(moveOffset, moveOffset + filters.movePageSize)
  const totalMovePages = Math.max(1, Math.ceil(moveRows.length / filters.movePageSize))

  return {
    summary,
    metrics: insights.metrics,
    categoryAnalytics: filterAnalytics(insights.categoryAnalytics, filters.focus),
    highlights: filterHighlights(insights.highlights, filters.highlight),
    assetMoves: moveItems,
    priceStatus: insights.priceStatus,
    filters,
    movePagination: {
      page: filters.movePage,
      pageSize: filters.movePageSize,
      total: moveRows.length,
      totalPages: totalMovePages,
    },
  }
}

function clampInt(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}
