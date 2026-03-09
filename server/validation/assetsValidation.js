const VALID_CATEGORIES = new Set([
  'CASH',
  'STOCKS',
  'CRYPTO',
  'PROPERTY',
  'CPF',
  'BONDS',
  'FOREX',
  'OTHER',
])

const LIVE_PRICED_CATEGORIES = new Set(['STOCKS', 'CRYPTO'])

export function validateAssetPayload(payload = {}) {
  const errors = []
  const details = payload.details && typeof payload.details === 'object' ? payload.details : {}
  const hasTicker = Boolean(String(payload.ticker || '').trim())
  const hasQuantity = payload.quantity !== '' && payload.quantity != null
  const isLivePricedEntry = LIVE_PRICED_CATEGORIES.has(payload.category) && (hasTicker || hasQuantity)

  if (!String(payload.name || '').trim()) {
    errors.push('Asset name is required.')
  }

  if (!VALID_CATEGORIES.has(payload.category)) {
    errors.push('Category is invalid.')
  }

  if (!payload.date) {
    errors.push('Acquisition date is required.')
  }

  if (!isNonNegativeNumber(payload.cost)) {
    errors.push('Cost must be 0 or greater.')
  }

  if (isLivePricedEntry) {
    if (!hasTicker) {
      errors.push('Ticker or coin id is required for live-priced assets.')
    }

    if (!hasQuantity || !isPositiveNumber(payload.quantity)) {
      errors.push('Quantity must be greater than 0 for live-priced assets.')
    }

    if (!isOptionalNonNegativeNumber(payload.value)) {
      errors.push('Initial value must be 0 or greater.')
    }
  } else if (!isNonNegativeNumber(payload.value)) {
    errors.push('Current value must be 0 or greater.')
  }

  if (payload.category === 'CPF') {
    if (!String(details.accountType || '').trim()) {
      errors.push('CPF assets require an account type.')
    }
    if (!isOptionalNonNegativeNumber(details.monthlyContribution)) {
      errors.push('CPF monthly contribution must be 0 or greater.')
    }
    if (!isOptionalNonNegativeNumber(details.annualInterestRate)) {
      errors.push('CPF interest rate must be 0 or greater.')
    }
  }

  if (payload.category === 'PROPERTY') {
    if (!String(details.address || '').trim()) {
      errors.push('Property assets require an address or location.')
    }
    if (!isOptionalNonNegativeNumber(details.remainingLoan)) {
      errors.push('Remaining loan must be 0 or greater.')
    }
    if (isOptionalNonNegativeNumber(details.remainingLoan) && isNonNegativeNumber(payload.value)) {
      if (Number(details.remainingLoan || 0) > Number(payload.value || 0)) {
        errors.push('Property loan cannot exceed current value.')
      }
    }
  }

  if (payload.category === 'BONDS') {
    if (!String(details.issuer || '').trim()) {
      errors.push('Bond assets require an issuer.')
    }
    if (!details.maturityDate) {
      errors.push('Bond assets require a maturity date.')
    }
    if (!isOptionalNonNegativeNumber(details.couponRate)) {
      errors.push('Bond coupon rate must be 0 or greater.')
    }
    if (details.maturityDate) {
      const maturityDate = new Date(details.maturityDate)
      if (Number.isNaN(maturityDate.getTime()) || maturityDate <= new Date()) {
        errors.push('Bond maturity must be in the future.')
      }
    }
  }

  return errors
}

export function parseAssetListQuery(query = {}) {
  const page = clampInt(query.page, 1, 1)
  const pageSize = clampInt(query.pageSize, 10, 1, 100)
  const search = String(query.search || '').trim()
  const category = String(query.category || 'ALL').toUpperCase()
  const pricing = String(query.pricing || 'ALL').toUpperCase()
  const sortBy = normalizeSortBy(query.sortBy)
  const sortDirection = String(query.sortDirection || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  return {
    page,
    pageSize,
    search,
    category: category === 'ALL' ? 'ALL' : category,
    pricing: ['ALL', 'LIVE', 'MANUAL'].includes(pricing) ? pricing : 'ALL',
    sortBy,
    sortDirection,
  }
}

export function buildAssetListQueryParts(filters) {
  const conditions = []
  const params = []

  if (filters.search) {
    params.push(`%${filters.search}%`)
    const index = params.length
    conditions.push(`(
      name ILIKE $${index}
      OR COALESCE(ticker, '') ILIKE $${index}
      OR COALESCE(institution, '') ILIKE $${index}
      OR COALESCE(details::text, '') ILIKE $${index}
    )`)
  }

  if (filters.category !== 'ALL') {
    params.push(filters.category)
    conditions.push(`category = $${params.length}`)
  }

  if (filters.pricing === 'LIVE') {
    conditions.push('ticker IS NOT NULL AND quantity IS NOT NULL')
  }

  if (filters.pricing === 'MANUAL') {
    conditions.push('(ticker IS NULL OR quantity IS NULL)')
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

export function buildAssetOrderClause(sortBy, sortDirection) {
  const columnMap = {
    asset: 'name',
    category: 'category',
    value: 'value',
    cost: 'cost',
    pnl: '(value - cost)',
    date: 'date',
  }

  const column = columnMap[sortBy] || columnMap.value
  return `ORDER BY ${column} ${sortDirection}, name ASC`
}

function normalizeSortBy(sortBy) {
  const value = String(sortBy || 'value').toLowerCase()
  return ['asset', 'category', 'value', 'cost', 'pnl', 'date'].includes(value)
    ? value
    : 'value'
}

function clampInt(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

function isNonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0
}

function isOptionalNonNegativeNumber(value) {
  if (value === '' || value == null) {
    return true
  }
  return isNonNegativeNumber(value)
}
