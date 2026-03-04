import { WELLNESS_THRESHOLDS } from '../../../shared/constants.js'

export function calculateWellnessScore(assets) {
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  if (total === 0) return { score: 0, breakdown: [] }

  const byCategory = {}
  assets.forEach((a) => {
    byCategory[a.category] = (byCategory[a.category] || 0) + a.value
  })

  // 1. Diversification — no single category > 40%
  const maxConcentration = Math.max(...Object.values(byCategory)) / total
  const diversificationScore = maxConcentration <= WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX
    ? 25
    : Math.round(25 * (1 - (maxConcentration - WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX) / 0.6))

  // 2. Liquidity — liquid assets / total, target > 20%
  const liquidCategories = ['CASH', 'STOCKS', 'CRYPTO']
  const liquidTotal = liquidCategories.reduce((sum, cat) => sum + (byCategory[cat] || 0), 0)
  const liquidityRatio = liquidTotal / total
  const liquidityScore = liquidityRatio >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET
    ? 25
    : Math.round(25 * (liquidityRatio / WELLNESS_THRESHOLDS.LIQUIDITY_TARGET))

  // 3. Crypto volatility — crypto % of portfolio, flag if > 30%
  const cryptoRatio = (byCategory.CRYPTO || 0) / total
  const cryptoScore = cryptoRatio <= WELLNESS_THRESHOLDS.CRYPTO_MAX
    ? 25
    : Math.round(25 * (1 - (cryptoRatio - WELLNESS_THRESHOLDS.CRYPTO_MAX) / 0.7))

  // 4. Emergency fund — cash / monthly expenses, target > 6x
  const cashTotal = byCategory.CASH || 0
  const monthsCovered = cashTotal / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
  const emergencyScore = monthsCovered >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS
    ? 25
    : Math.round(25 * (monthsCovered / WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS))

  const score = Math.max(0, Math.min(100, diversificationScore + liquidityScore + cryptoScore + emergencyScore))

  return {
    score,
    breakdown: [
      {
        label: 'Diversification',
        score: diversificationScore,
        max: 25,
        detail: `Largest holding: ${(maxConcentration * 100).toFixed(1)}%`,
        status: maxConcentration <= WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Liquidity',
        score: liquidityScore,
        max: 25,
        detail: `Liquid assets: ${(liquidityRatio * 100).toFixed(1)}%`,
        status: liquidityRatio >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? 'pass' : 'fail',
      },
      {
        label: 'Crypto Exposure',
        score: cryptoScore,
        max: 25,
        detail: `Crypto: ${(cryptoRatio * 100).toFixed(1)}% of portfolio`,
        status: cryptoRatio <= WELLNESS_THRESHOLDS.CRYPTO_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Emergency Fund',
        score: emergencyScore,
        max: 25,
        detail: `${monthsCovered.toFixed(1)} months covered`,
        status: monthsCovered >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? 'pass' : 'fail',
      },
    ],
  }
}
