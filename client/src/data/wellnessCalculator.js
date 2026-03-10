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
  const diversificationScore = maxCategoryPct <= T.DIVERSIFICATION_MAX
    ? W.diversification
    : clampScore(W.diversification * (1 - (maxCategoryPct - T.DIVERSIFICATION_MAX) / 0.6), W.diversification)

  // --- Factor 2: Liquidity ---
  const liquidTotal = ['CASH', 'STOCKS', 'CRYPTO'].reduce((sum, cat) => sum + (byCategory[cat] || 0), 0)
  const liquidityRatio = liquidTotal / total
  const liquidityScore = liquidityRatio >= T.LIQUIDITY_TARGET
    ? W.liquidity
    : clampScore(W.liquidity * (liquidityRatio / T.LIQUIDITY_TARGET), W.liquidity)

  // --- Factor 3: Crypto Exposure (volatile only, stablecoins excluded) ---
  const cryptoRatio = (byCategory.CRYPTO || 0) / total
  const cryptoScore = cryptoRatio <= T.CRYPTO_MAX
    ? W.cryptoExposure
    : clampScore(W.cryptoExposure * (1 - (cryptoRatio - T.CRYPTO_MAX) / 0.7), W.cryptoExposure)

  // --- Factor 4: Emergency Fund ---
  const cashTotal = byCategory.CASH || 0
  const monthsCovered = cashTotal / T.MONTHLY_EXPENSES
  const emergencyScore = monthsCovered >= T.EMERGENCY_FUND_MONTHS
    ? W.emergencyFund
    : clampScore(W.emergencyFund * (monthsCovered / T.EMERGENCY_FUND_MONTHS), W.emergencyFund)

  // --- Factor 5: Concentration Risk (single-asset level) ---
  const maxAssetPct = assets.length > 0
    ? Math.max(...assets.map((a) => a.value)) / total
    : 0
  const concentrationScore = maxAssetPct <= T.SINGLE_ASSET_MAX
    ? W.concentrationRisk
    : clampScore(W.concentrationRisk * (1 - (maxAssetPct - T.SINGLE_ASSET_MAX) / 0.75), W.concentrationRisk)

  // --- Factor 6: Asset Growth Trend ---
  let growthScore
  if (monthlyChangePct === null || monthlyChangePct === undefined) {
    growthScore = Math.round(W.assetGrowthTrend * 0.5) // neutral if no data
  } else if (monthlyChangePct >= T.GROWTH_TARGET_MONTHLY) {
    growthScore = W.assetGrowthTrend
  } else if (monthlyChangePct >= 0) {
    growthScore = clampScore(W.assetGrowthTrend * (monthlyChangePct / T.GROWTH_TARGET_MONTHLY), W.assetGrowthTrend)
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
  const incomeScore = incomeRatio >= T.INCOME_GENERATING_TARGET
    ? W.incomeGenerating
    : clampScore(W.incomeGenerating * (incomeRatio / T.INCOME_GENERATING_TARGET), W.incomeGenerating)

  // --- Factor 8: Rebalancing Alert ---
  const maxDrift = Object.entries(TARGET_ALLOCATION).reduce((max, [cat, target]) => {
    const actual = (byCategory[cat] || 0) / total
    return Math.max(max, Math.abs(actual - target))
  }, 0)
  const rebalanceScore = maxDrift <= T.REBALANCING_DRIFT_MAX
    ? W.rebalancingAlert
    : clampScore(W.rebalancingAlert * (1 - (maxDrift - T.REBALANCING_DRIFT_MAX) / 0.40), W.rebalancingAlert)

  const score = Math.max(0, Math.min(100,
    diversificationScore + liquidityScore + cryptoScore + emergencyScore +
    concentrationScore + growthScore + incomeScore + rebalanceScore
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
        currentValue: `${(maxCategoryPct * 100).toFixed(1)}% (Target: ≤${(T.DIVERSIFICATION_MAX * 100).toFixed(0)}%)`,
        explanation: 'Spreading investments across multiple asset categories reduces risk.',
        whyItMatters: 'Concentrating too much in one category exposes you to category-specific downturns.',
        actionIfLow: 'Consider adding assets from underrepresented categories like bonds or real estate.',
      },
      {
        label: 'Liquidity',
        score: liquidityScore,
        max: W.liquidity,
        detail: `Weighted liquidity: ${(liquidityRatio * 100).toFixed(1)}%`,
        status: liquidityRatio >= T.LIQUIDITY_TARGET ? 'pass' : 'fail',
        currentValue: `${(liquidityRatio * 100).toFixed(1)}% (Target: ≥${(T.LIQUIDITY_TARGET * 100).toFixed(0)}%)`,
        explanation: 'Liquid assets (cash, stocks, crypto) can be quickly converted to cash.',
        whyItMatters: 'Ensures you can meet emergencies or opportunities without forced selling.',
        actionIfLow: 'Build up your cash reserves or increase holdings in easily tradable assets.',
      },
      {
        label: 'Volatility',
        score: cryptoScore,
        max: W.cryptoExposure,
        detail: `Crypto + FOREX: ${(cryptoRatio * 100).toFixed(1)}%`,
        status: cryptoRatio <= T.CRYPTO_MAX ? 'pass' : 'fail',
        currentValue: `${(cryptoRatio * 100).toFixed(1)}% (Target: ≤${(T.CRYPTO_MAX * 100).toFixed(0)}%)`,
        explanation: 'Volatile assets (crypto, forex) can swing dramatically in short periods.',
        whyItMatters: 'Too much volatility can trigger panic selling and derail long-term plans.',
        actionIfLow: 'Your volatile exposure is healthy. Stablecoins are counted as cash, not volatility.',
      },
      {
        label: 'Emergency Fund',
        score: emergencyScore,
        max: W.emergencyFund,
        detail: `${monthsCovered.toFixed(1)} months covered`,
        status: monthsCovered >= T.EMERGENCY_FUND_MONTHS ? 'pass' : 'fail',
        currentValue: `${monthsCovered.toFixed(1)} months (Target: ≥${T.EMERGENCY_FUND_MONTHS} months)`,
        explanation: 'Emergency funds are liquid cash reserves to cover unexpected expenses.',
        whyItMatters: 'Prevents forced asset sales during crises, protecting your long-term investments.',
        actionIfLow: monthsCovered < T.EMERGENCY_FUND_MONTHS ? `Add more cash to reach your ${T.EMERGENCY_FUND_MONTHS}-month target.` : 'Your emergency fund is solid.',
      },
      {
        label: 'Concentration',
        score: concentrationScore,
        max: W.concentrationRisk,
        detail: `Largest asset: ${(maxAssetPct * 100).toFixed(1)}%`,
        status: maxAssetPct <= T.SINGLE_ASSET_MAX ? 'pass' : 'fail',
        currentValue: `${(maxAssetPct * 100).toFixed(1)}% (Target: ≤${(T.SINGLE_ASSET_MAX * 100).toFixed(0)}%)`,
        explanation: 'No single investment should dominate your portfolio.',
        whyItMatters: 'Over-concentration in one asset creates excessive risk from company or security-specific events.',
        actionIfLow: 'Consider trimming your largest holding and diversifying into other opportunities.',
      },
      {
        label: 'Growth Trend',
        score: growthScore,
        max: W.assetGrowthTrend,
        detail: monthlyChangePct !== null ? `${monthlyChangePct >= 0 ? '+' : ''}${monthlyChangePct.toFixed(1)}% monthly` : 'No data yet',
        status: monthlyChangePct === null ? 'neutral' : monthlyChangePct >= 0 ? 'pass' : 'fail',
        currentValue: monthlyChangePct !== null ? `${monthlyChangePct >= 0 ? '+' : ''}${monthlyChangePct.toFixed(2)}% (Target: ≥${(T.GROWTH_TARGET_MONTHLY * 100).toFixed(1)}%)` : 'Insufficient data',
        explanation: 'Portfolio growth indicates positive returns and wealth accumulation.',
        whyItMatters: 'Negative growth trends may signal misallocated assets or market headwinds.',
        actionIfLow: monthlyChangePct !== null && monthlyChangePct < 0 ? 'Review asset allocation and consider rebalancing.' : 'Growth is on track. Stay the course with your strategy.',
      },
      {
        label: 'Income Assets',
        score: incomeScore,
        max: W.incomeGenerating,
        detail: `${(incomeRatio * 100).toFixed(1)}% income-generating`,
        status: incomeRatio >= T.INCOME_GENERATING_TARGET ? 'pass' : 'fail',
        currentValue: `${(incomeRatio * 100).toFixed(1)}% (Target: ≥${(T.INCOME_GENERATING_TARGET * 100).toFixed(0)}%)`,
        explanation: 'Income-generating assets (bonds, dividend stocks, rental property) provide cash flow.',
        whyItMatters: 'Regular income reduces dependence on asset appreciation and provides stability.',
        actionIfLow: 'Consider adding dividend-paying stocks, bonds, or CPF contributions.',
      },
      {
        label: 'Rebalancing',
        score: rebalanceScore,
        max: W.rebalancingAlert,
        detail: `Max drift: ${(maxDrift * 100).toFixed(1)}%`,
        status: maxDrift <= T.REBALANCING_DRIFT_MAX ? 'pass' : 'fail',
        currentValue: `${(maxDrift * 100).toFixed(1)}% drift (Target: ≤${(T.REBALANCING_DRIFT_MAX * 100).toFixed(1)}%)`,
        explanation: 'Rebalancing realigns your portfolio to match your target allocation.',
        whyItMatters: 'Without rebalancing, winners balloon while losers shrink, drifting from your plan.',
        actionIfLow: maxDrift > T.REBALANCING_DRIFT_MAX ? 'Rebalance soon to bring categories back to target.' : 'Your portfolio is well-balanced. Hold steady.',
      },
    ],
  }
}
