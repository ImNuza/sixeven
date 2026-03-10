import {
  WELLNESS_THRESHOLDS,
  WELLNESS_WEIGHTS,
  TARGET_ALLOCATION,
  isStablecoin,
  parseMonthlyExpenses,
  parseAnnualIncome,
  getRiskAdjustedThresholds,
} from '../../../shared/constants.js'

export function getWellnessStatus(score) {
  if (score >= 85) {
    return {
      label: 'Excellent',
      tone: 'positive',
      color: '#18a871',
      summary: 'Balanced, resilient, and comfortably diversified.',
    }
  }

  if (score >= 70) {
    return {
      label: 'Strong',
      tone: 'positive',
      color: '#2f7cf6',
      summary: 'On track with only a few areas to tighten.',
    }
  }

  if (score >= 50) {
    return {
      label: 'Caution',
      tone: 'warning',
      color: '#f0a100',
      summary: 'Functional, but a few risks need attention soon.',
    }
  }

  return {
    label: 'Fragile',
    tone: 'danger',
    color: '#e65054',
    summary: 'Liquidity, diversification, or risk exposure needs work.',
  }
}

function clampScore(raw, max) {
  return Math.max(0, Math.min(max, Math.round(raw)))
}

export function calculateWellnessScore(assets, options = {}) {
  const { monthlyChangePct = null, userProfile = null } = options
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  if (total === 0) return { score: 0, breakdown: [] }

  const W = WELLNESS_WEIGHTS
  const T = WELLNESS_THRESHOLDS

  // Build category buckets, reclassifying stablecoins as cash
  const byCategory = {}
  let stablecoinValue = 0
  assets.forEach((a) => {
    if (a.category === 'CRYPTO' && isStablecoin(a.ticker)) {
      stablecoinValue += a.value
      byCategory['CASH'] = (byCategory['CASH'] || 0) + a.value
    } else {
      byCategory[a.category] = (byCategory[a.category] || 0) + a.value
    }
  })

  // --- Factor 1: Diversification (category-level) ---
  const maxCategoryPct = Math.max(...Object.values(byCategory)) / total
  const diversificationScore = maxCategoryPct <= WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX
    ? W.diversification
    : clampScore(W.diversification * (1 - (maxCategoryPct - WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX) / 0.6), W.diversification)

  // --- Factor 2: Liquidity ---
  const liquidTotal = ['CASH', 'STOCKS', 'CRYPTO'].reduce((sum, cat) => sum + (byCategory[cat] || 0), 0)
  const liquidityRatio = liquidTotal / total
  const liquidityScore = liquidityRatio >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET
    ? W.liquidity
    : clampScore(W.liquidity * (liquidityRatio / WELLNESS_THRESHOLDS.LIQUIDITY_TARGET), W.liquidity)

  // --- Factor 3: Crypto Exposure (volatile only, stablecoins excluded) ---
  const cryptoRatio = (byCategory.CRYPTO || 0) / total
  const cryptoScore = cryptoRatio <= WELLNESS_THRESHOLDS.CRYPTO_MAX
    ? W.cryptoExposure
    : clampScore(W.cryptoExposure * (1 - (cryptoRatio - WELLNESS_THRESHOLDS.CRYPTO_MAX) / 0.7), W.cryptoExposure)

  // --- Factor 4: Emergency Fund (uses actual user expenses when available) ---
  const cashTotal = byCategory.CASH || 0
  const monthsCovered = cashTotal / T.MONTHLY_EXPENSES
  const emergencyScore = monthsCovered >= T.EMERGENCY_FUND_MONTHS
    ? W.emergencyFund
    : clampScore(W.emergencyFund * (monthsCovered / WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS), W.emergencyFund)

  // --- Factor 5: Concentration Risk (single-asset level) ---
  const maxAssetPct = assets.length > 0
    ? Math.max(...assets.map((a) => a.value)) / total
    : 0
  const concentrationScore = maxAssetPct <= WELLNESS_THRESHOLDS.SINGLE_ASSET_MAX
    ? W.concentrationRisk
    : clampScore(W.concentrationRisk * (1 - (maxAssetPct - WELLNESS_THRESHOLDS.SINGLE_ASSET_MAX) / 0.75), W.concentrationRisk)

  // --- Factor 6: Asset Growth Trend ---
  let growthScore
  if (monthlyChangePct === null || monthlyChangePct === undefined) {
    growthScore = Math.round(W.assetGrowthTrend * 0.5) // neutral if no data
  } else if (monthlyChangePct >= WELLNESS_THRESHOLDS.GROWTH_TARGET_MONTHLY) {
    growthScore = W.assetGrowthTrend
  } else if (monthlyChangePct >= 0) {
    growthScore = clampScore(W.assetGrowthTrend * (monthlyChangePct / WELLNESS_THRESHOLDS.GROWTH_TARGET_MONTHLY), W.assetGrowthTrend)
  } else {
    growthScore = clampScore(W.assetGrowthTrend * Math.max(0, 1 + monthlyChangePct / 10), W.assetGrowthTrend)
  }

  // --- Factor 7: Income-Generating Assets ---
  const incomeGenerating = assets.reduce((sum, a) => {
    if (a.category === 'BONDS') return sum + a.value
    if (a.category === 'CPF') return sum + a.value
    if (a.category === 'PROPERTY' && Number(a.details?.rentalIncome) > 0) return sum + a.value
    if (a.category === 'STOCKS' && Number(a.details?.dividendYield) > 0) return sum + a.value
    return sum
  }, 0)
  const incomeRatio = incomeGenerating / total
  const incomeScore = incomeRatio >= WELLNESS_THRESHOLDS.INCOME_GENERATING_TARGET
    ? W.incomeGenerating
    : clampScore(W.incomeGenerating * (incomeRatio / WELLNESS_THRESHOLDS.INCOME_GENERATING_TARGET), W.incomeGenerating)

  // --- Factor 8: Rebalancing Alert ---
  const maxDrift = Object.entries(TARGET_ALLOCATION).reduce((max, [cat, target]) => {
    const actual = (byCategory[cat] || 0) / total
    return Math.max(max, Math.abs(actual - target))
  }, 0)
  const rebalanceScore = maxDrift <= WELLNESS_THRESHOLDS.REBALANCING_DRIFT_MAX
    ? W.rebalancingAlert
    : clampScore(W.rebalancingAlert * (1 - (maxDrift - WELLNESS_THRESHOLDS.REBALANCING_DRIFT_MAX) / 0.40), W.rebalancingAlert)

  // --- Factor 10: Savings Rate (income vs expenses health) ---
  let savingsScore
  let savingsDetail = 'No income/expense data provided'
  let savingsStatus = 'neutral'
  if (annualIncome !== null) {
    const monthlyIncome = annualIncome / 12
    const monthlySavings = monthlyIncome - monthlyExpenses
    const savingsRatio = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
    // Target: save at least 20% of income
    const TARGET_SAVINGS_RATIO = 0.20
    if (savingsRatio >= TARGET_SAVINGS_RATIO) {
      savingsScore = W.savingsRate
      savingsStatus = 'pass'
    } else if (savingsRatio > 0) {
      savingsScore = clampScore(W.savingsRate * (savingsRatio / TARGET_SAVINGS_RATIO), W.savingsRate)
      savingsStatus = 'fail'
    } else {
      savingsScore = 0
      savingsStatus = 'fail'
    }
    savingsDetail = `${(savingsRatio * 100).toFixed(0)}% of income saved monthly`
  } else {
    // Neutral when no data — half credit
    savingsScore = Math.round(W.savingsRate * 0.5)
    savingsStatus = 'neutral'
  }

  // --- Goal-specific hints ---
  const goalHints = buildGoalHints(financialGoals, {
    hasProperty: (byCategory.PROPERTY || 0) > 0,
    emergencyMonths: monthsCovered,
    targetEmergencyMonths: T.EMERGENCY_FUND_MONTHS,
    debtRatio: debtToAssetRatio,
    incomeRatio,
    monthlyExpenses,
  })

  const score = Math.max(0, Math.min(100,
    diversificationScore + liquidityScore + cryptoScore + emergencyScore +
    concentrationScore + growthScore + incomeScore + debtScore + rebalanceScore
  ))

  return {
    score,
    breakdown: [
      {
        label: 'Diversification',
        score: diversificationScore,
        max: W.diversification,
        detail: `Largest category: ${(maxCategoryPct * 100).toFixed(1)}%`,
        status: maxCategoryPct <= T.DIVERSIFICATION_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Liquidity',
        score: liquidityScore,
        max: W.liquidity,
        detail: `Weighted liquidity: ${(liquidityRatio * 100).toFixed(1)}%`,
        status: liquidityRatio >= T.LIQUIDITY_TARGET ? 'pass' : 'fail',
      },
      {
        label: 'Volatility',
        score: cryptoScore,
        max: W.cryptoExposure,
        detail: `Crypto + FOREX: ${(volatileRatio * 100).toFixed(1)}%`,
        status: volatileRatio <= T.CRYPTO_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Emergency Fund',
        score: emergencyScore,
        max: W.emergencyFund,
        detail: `${monthsCovered.toFixed(1)} months covered`,
        status: monthsCovered >= T.EMERGENCY_FUND_MONTHS ? 'pass' : 'fail',
      },
      {
        label: 'Concentration',
        score: concentrationScore,
        max: W.concentrationRisk,
        detail: `Largest asset: ${(maxAssetPct * 100).toFixed(1)}%`,
        status: maxAssetPct <= T.SINGLE_ASSET_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Growth Trend',
        score: growthScore,
        max: W.assetGrowthTrend,
        detail: monthlyChangePct !== null ? `${monthlyChangePct >= 0 ? '+' : ''}${monthlyChangePct.toFixed(1)}% monthly` : 'No data yet',
        status: monthlyChangePct === null ? 'neutral' : monthlyChangePct >= 0 ? 'pass' : 'fail',
      },
      {
        label: 'Income Assets',
        score: incomeScore,
        max: W.incomeGenerating,
        detail: `${(incomeRatio * 100).toFixed(1)}% income-gen${avgYield > 0 ? ` (${(avgYield * 100).toFixed(1)}% avg yield)` : ''}`,
        status: incomeRatio >= T.INCOME_GENERATING_TARGET ? 'pass' : 'fail',
      },
      {
        label: 'Debt Health',
        score: debtScore,
        max: W.debtHealth,
        detail: totalDebt > 0 ? `${(debtToAssetRatio * 100).toFixed(1)}% debt ratio` : 'No debt recorded',
        status: debtToAssetRatio <= T.DEBT_TO_ASSET_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Rebalancing',
        score: rebalanceScore,
        max: W.rebalancingAlert,
        detail: `Max drift: ${(maxDrift * 100).toFixed(1)}%`,
        status: maxDrift <= T.REBALANCING_DRIFT_MAX ? 'pass' : 'fail',
      },
    ],
  }
}
