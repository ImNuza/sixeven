import {
  WELLNESS_THRESHOLDS,
  WELLNESS_WEIGHTS,
  TARGET_ALLOCATION,
  isStablecoin,
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
  const { monthlyChangePct = null } = options
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  if (total === 0) return { score: 0, breakdown: [] }

  const W = WELLNESS_WEIGHTS

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

  // --- Factor 4: Emergency Fund ---
  const cashTotal = byCategory.CASH || 0
  const monthsCovered = cashTotal / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
  const emergencyScore = monthsCovered >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS
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
        currentValue: `Largest category: ${(maxCategoryPct * 100).toFixed(1)}%`,
        explanation: 'Measures how evenly spread your investments are across different asset categories.',
        whyItMatters: 'Diversification reduces risk by ensuring no single category disproportionately affects your portfolio. A concentrated portfolio is more vulnerable to market downturns in that sector.',
        actionIfLow: maxCategoryPct > WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? `Your ${Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0][0]} holding is ${(maxCategoryPct * 100).toFixed(0)}% of your portfolio. Consider adding more assets in underrepresented categories like bonds, property, or alternative investments.` : null,
        status: maxCategoryPct <= WELLNESS_THRESHOLDS.DIVERSIFICATION_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Liquidity',
        score: liquidityScore,
        max: W.liquidity,
        currentValue: `Liquid assets: ${(liquidityRatio * 100).toFixed(1)}%`,
        explanation: 'Measures the percentage of your portfolio in liquid assets (cash, stocks, crypto) that can be quickly converted to cash.',
        whyItMatters: 'Liquidity ensures you can handle unexpected expenses or opportunities without having to sell long-term investments at unfavorable times. It provides financial flexibility and peace of mind.',
        actionIfLow: liquidityRatio < WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? `You have ${(liquidityRatio * 100).toFixed(0)}% in liquid assets. Consider building up cash reserves or adding more readily accessible investments to reach the ${(WELLNESS_THRESHOLDS.LIQUIDITY_TARGET * 100).toFixed(0)}% target.` : null,
        status: liquidityRatio >= WELLNESS_THRESHOLDS.LIQUIDITY_TARGET ? 'pass' : 'fail',
      },
      {
        label: 'Crypto Exposure',
        score: cryptoScore,
        max: W.cryptoExposure,
        currentValue: `Volatile crypto: ${(cryptoRatio * 100).toFixed(1)}%`,
        explanation: 'Measures your exposure to high-volatility cryptocurrencies (excluding stablecoins, which are counted as cash).',
        whyItMatters: 'While crypto offers growth potential, excessive exposure can create wild swings in your net worth. Keeping it in check protects your overall financial stability.',
        actionIfLow: cryptoRatio > WELLNESS_THRESHOLDS.CRYPTO_MAX ? `Your crypto holdings are ${(cryptoRatio * 100).toFixed(0)}% of your portfolio. Consider trimming to the recommended ${(WELLNESS_THRESHOLDS.CRYPTO_MAX * 100).toFixed(0)}% or below to reduce volatility risk.` : null,
        status: cryptoRatio <= WELLNESS_THRESHOLDS.CRYPTO_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Emergency Fund',
        score: emergencyScore,
        max: W.emergencyFund,
        currentValue: `${monthsCovered.toFixed(1)} months covered`,
        explanation: 'Measures how many months of living expenses your cash reserves can cover.',
        whyItMatters: 'An emergency fund is your financial safety net. Without one, unexpected job loss or medical expenses can force you to take on debt or panic-sell investments.',
        actionIfLow: monthsCovered < WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? `You have ${monthsCovered.toFixed(1)} months of expenses covered. Aim for ${WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS} months by setting aside more cash in a high-yield account.` : null,
        status: monthsCovered >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? 'pass' : 'fail',
      },
      {
        label: 'Concentration',
        score: concentrationScore,
        max: W.concentrationRisk,
        currentValue: `Largest asset: ${(maxAssetPct * 100).toFixed(1)}%`,
        explanation: 'Measures the percentage of your portfolio in your single largest holding.',
        whyItMatters: 'Extreme concentration in one asset (like a single stock) exposes you to company or asset-specific risk. If that asset drops, your entire portfolio suffers.',
        actionIfLow: maxAssetPct > WELLNESS_THRESHOLDS.SINGLE_ASSET_MAX ? `Your largest holding is ${(maxAssetPct * 100).toFixed(0)}% of your portfolio. Reduce it gradually by trimming on strength and redeploying to other investments.` : null,
        status: maxAssetPct <= WELLNESS_THRESHOLDS.SINGLE_ASSET_MAX ? 'pass' : 'fail',
      },
      {
        label: 'Growth Trend',
        score: growthScore,
        max: W.assetGrowthTrend,
        currentValue: monthlyChangePct !== null ? `${monthlyChangePct >= 0 ? '+' : ''}${monthlyChangePct.toFixed(1)}% monthly` : 'No data yet',
        explanation: 'Tracks the month-over-month change in your portfolio value.',
        whyItMatters: 'Consistent positive growth shows your portfolio is working for you. It reflects your investment strategy, market performance, and any contributions you make.',
        actionIfLow: monthlyChangePct !== null && monthlyChangePct < 0 ? `Your portfolio declined ${Math.abs(monthlyChangePct).toFixed(1)}% last month. Review your holdings for any that are underperforming and consider rebalancing to better-positioned assets.` : null,
        status: monthlyChangePct === null ? 'neutral' : monthlyChangePct >= 0 ? 'pass' : 'fail',
      },
      {
        label: 'Income Assets',
        score: incomeScore,
        max: W.incomeGenerating,
        currentValue: `${(incomeRatio * 100).toFixed(1)}% income-generating`,
        explanation: 'Measures the percentage of your portfolio in assets that produce income (bonds, dividend stocks, rental properties, CPF).',
        whyItMatters: 'Income assets provide steady returns and can dramatically improve long-term wealth without requiring you to sell. They work for you during market downturns.',
        actionIfLow: incomeRatio < WELLNESS_THRESHOLDS.INCOME_GENERATING_TARGET ? `Only ${(incomeRatio * 100).toFixed(0)}% of your portfolio generates income. Consider adding dividend stocks, bonds, or renting out property to reach ${(WELLNESS_THRESHOLDS.INCOME_GENERATING_TARGET * 100).toFixed(0)}%.` : null,
        status: incomeRatio >= WELLNESS_THRESHOLDS.INCOME_GENERATING_TARGET ? 'pass' : 'fail',
      },
      {
        label: 'Rebalancing',
        score: rebalanceScore,
        max: W.rebalancingAlert,
        currentValue: `Max drift: ${(maxDrift * 100).toFixed(1)}%`,
        explanation: 'Compares your actual allocation to target allocation and measures the largest deviation.',
        whyItMatters: 'Over time, winning assets grow and losing ones shrink, pushing your portfolio away from your intended strategy. Rebalancing keeps you aligned with your risk goals.',
        actionIfLow: maxDrift > WELLNESS_THRESHOLDS.REBALANCING_DRIFT_MAX ? `Your allocation has drifted ${(maxDrift * 100).toFixed(0)}% from target. Consider rebalancing by trimming winners and adding to laggards to restore your intended balance.` : null,
        status: maxDrift <= WELLNESS_THRESHOLDS.REBALANCING_DRIFT_MAX ? 'pass' : 'fail',
      },
    ],
  }
}
