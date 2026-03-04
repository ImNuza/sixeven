import { WELLNESS_THRESHOLDS, ASSET_CATEGORIES } from './constants.js'

function round(value, digits = 1) {
  return Number(value.toFixed(digits))
}

export function groupAssetsByCategory(assets) {
  return assets.reduce((groups, asset) => {
    groups[asset.category] = (groups[asset.category] || 0) + asset.value
    return groups
  }, {})
}

export function buildPortfolioInsights(assets, summary, prices = []) {
  if (!assets.length) {
    return {
      highlights: [],
      metrics: [],
      assetMoves: [],
      categoryAnalytics: [],
      priceStatus: 'No live price data available yet.',
    }
  }

  const totalValue = summary?.totalNetWorth || assets.reduce((sum, asset) => sum + asset.value, 0)
  const byCategory = groupAssetsByCategory(assets)
  const [largestCategory = 'OTHER', largestCategoryValue = 0] = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])[0] || []

  const largestCategoryPct = totalValue > 0 ? largestCategoryValue / totalValue : 0
  const liquidValue = ['CASH', 'STOCKS', 'CRYPTO'].reduce((sum, key) => sum + (byCategory[key] || 0), 0)
  const liquidPct = totalValue > 0 ? liquidValue / totalValue : 0
  const cryptoPct = totalValue > 0 ? (byCategory.CRYPTO || 0) / totalValue : 0
  const cashMonths = (byCategory.CASH || 0) / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES

  const assetMoves = assets
    .map((asset) => {
      const gain = asset.value - asset.cost
      const pct = asset.cost > 0 ? (gain / asset.cost) * 100 : 0
      return {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        gain,
        pct,
      }
    })

  const latestPrice = prices[0]
  const priceStatus = latestPrice
    ? `Latest live market update: ${new Date(latestPrice.updated_at).toLocaleString('en-SG')}`
    : 'Live prices will appear here after the first successful refresh.'

  const highlights = [
    {
      type: largestCategoryPct > WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? 'warning' : 'positive',
      title: largestCategoryPct > WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? 'Concentration Risk' : 'Well Diversified',
      message: `${ASSET_CATEGORIES[largestCategory] || largestCategory} is ${round(largestCategoryPct * 100)}% of your portfolio${largestCategoryPct > WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? ' — trim to stay under 40%.' : '.'}`,
    },
    {
      type: liquidPct >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? 'positive' : 'warning',
      title: liquidPct >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? 'Healthy Liquidity' : 'Low Liquidity',
      message: `${round(liquidPct * 100)}% liquid${liquidPct < WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? ' — raise to 20% for flexibility.' : ' — above the 20% threshold.'}`,
    },
    {
      type: cryptoPct > WELLNESS_THRESHOLDS.CRYPTO_MAX ? 'warning' : 'positive',
      title: cryptoPct > WELLNESS_THRESHOLDS.CRYPTO_MAX ? 'High Crypto Risk' : 'Crypto in Range',
      message: `${round(cryptoPct * 100)}% in crypto${cryptoPct > WELLNESS_THRESHOLDS.CRYPTO_MAX ? ' — recommended cap is 30%.' : ' — within the preferred range.'}`,
    },
    {
      type: cashMonths >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? 'positive' : 'info',
      title: cashMonths >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? 'Emergency Fund OK' : 'Build Emergency Fund',
      message: `${round(cashMonths)} months of expenses covered${cashMonths < WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? ` — target is ${WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS} months.` : '.'}`,
    },
  ]

  const metrics = [
    { label: 'Largest Category', value: `${round(largestCategoryPct * 100)}%`, detail: ASSET_CATEGORIES[largestCategory] || largestCategory },
    { label: 'Liquid Assets', value: `${round(liquidPct * 100)}%`, detail: 'Cash + stocks + crypto' },
    { label: 'Crypto Weight', value: `${round(cryptoPct * 100)}%`, detail: 'Risk exposure to volatile assets' },
    { label: 'Cash Runway', value: `${round(cashMonths)} mo`, detail: 'Emergency fund coverage' },
  ]

  const cpfAssets = assets.filter((asset) => asset.category === 'CPF')
  const propertyAssets = assets.filter((asset) => asset.category === 'PROPERTY')
  const bondAssets = assets.filter((asset) => asset.category === 'BONDS')

  const cpfBalance = cpfAssets.reduce((sum, asset) => sum + asset.value, 0)
  const cpfWeightedInterest = cpfAssets.reduce((sum, asset) => {
    const rate = Number(asset.details?.annualInterestRate || 0)
    return sum + asset.value * rate
  }, 0)
  const cpfProjectedGrowth = cpfWeightedInterest / 100

  const propertyValue = propertyAssets.reduce((sum, asset) => sum + asset.value, 0)
  const propertyLoan = propertyAssets.reduce(
    (sum, asset) => sum + Number(asset.details?.remainingLoan || 0),
    0
  )
  const propertyEquity = propertyValue - propertyLoan
  const propertyLtv = propertyValue > 0 ? (propertyLoan / propertyValue) * 100 : 0

  const bondValue = bondAssets.reduce((sum, asset) => sum + asset.value, 0)
  const bondWeightedCoupon = bondAssets.reduce((sum, asset) => {
    const coupon = Number(asset.details?.couponRate || 0)
    return sum + asset.value * coupon
  }, 0)
  const averageBondCoupon = bondValue > 0 ? bondWeightedCoupon / bondValue : 0
  const nextBondMaturity = bondAssets
    .map((asset) => asset.details?.maturityDate)
    .filter(Boolean)
    .sort()[0]

  const categoryAnalytics = [
    {
      key: 'cpf',
      title: 'CPF Growth',
      accent: 'text-cyan-300',
      value: `${round((cpfBalance / totalValue) * 100 || 0)}%`,
      subtitle: 'Portfolio weight in CPF',
      metrics: [
        { label: 'CPF Balance', value: cpfBalance, format: 'currency' },
        { label: 'Projected Annual Interest', value: cpfProjectedGrowth, format: 'currency' },
        { label: 'Weighted Interest Rate', value: averageRate(cpfAssets, 'annualInterestRate'), format: 'percent' },
      ],
    },
    {
      key: 'property',
      title: 'Property Leverage',
      accent: 'text-emerald-300',
      value: `${round(propertyLtv)}%`,
      subtitle: 'Loan-to-value estimate',
      metrics: [
        { label: 'Property Value', value: propertyValue, format: 'currency' },
        { label: 'Remaining Loan', value: propertyLoan, format: 'currency' },
        { label: 'Estimated Equity', value: propertyEquity, format: 'currency' },
      ],
    },
    {
      key: 'bonds',
      title: 'Bond Ladder',
      accent: 'text-amber-300',
      value: nextBondMaturity || 'No maturity',
      subtitle: 'Nearest maturity date',
      metrics: [
        { label: 'Bond Allocation', value: bondValue, format: 'currency' },
        { label: 'Average Coupon', value: averageBondCoupon, format: 'percent' },
        { label: 'Bond Positions', value: bondAssets.length, format: 'number' },
      ],
    },
  ]

  return {
    highlights,
    metrics,
    assetMoves: assetMoves.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain)),
    categoryAnalytics,
    priceStatus,
  }
}

function averageRate(assets, key) {
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0)
  if (!totalValue) {
    return 0
  }

  const weighted = assets.reduce((sum, asset) => {
    const rate = Number(asset.details?.[key] || 0)
    return sum + asset.value * rate
  }, 0)

  return weighted / totalValue
}
