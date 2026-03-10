import {
  WELLNESS_THRESHOLDS,
  WELLNESS_WEIGHTS,
  TARGET_ALLOCATION,
  CATEGORY_LIQUIDITY,
  CATEGORY_VOLATILITY,
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

/**
 * Extract debt amount from asset details
 */
function getAssetDebt(asset) {
  if (!asset.details) return 0
  // Property loans
  if (asset.details.remainingLoan) {
    return Number(asset.details.remainingLoan) || 0
  }
  // Generic debt field (for future expansion)
  if (asset.details.debt) {
    return Number(asset.details.debt) || 0
  }
  return 0
}

/**
 * Get income yield from asset details (as decimal, e.g. 0.04 for 4%)
 */
function getAssetYield(asset) {
  if (!asset.details) return 0
  // CPF interest rate
  if (asset.details.annualInterestRate) {
    return Number(asset.details.annualInterestRate) / 100 || 0
  }
  // Bond coupon rate
  if (asset.details.couponRate) {
    return Number(asset.details.couponRate) / 100 || 0
  }
  // Stock dividend yield
  if (asset.details.dividendYield) {
    return Number(asset.details.dividendYield) / 100 || 0
  }
  // Rental yield (estimated as rentalIncome * 12 / value)
  if (asset.details.rentalIncome && asset.value > 0) {
    return (Number(asset.details.rentalIncome) * 12) / asset.value || 0
  }
  return 0
}

export function calculateWellnessScore(assets, options = {}) {
  const { monthlyChangePct = null, userProfile = null } = options
  const total = assets.reduce((sum, a) => sum + a.value, 0)
  if (total === 0) return { score: 0, breakdown: [] }

  const W = WELLNESS_WEIGHTS
  // Adjust thresholds based on user's risk appetite (falls back to defaults)
  const T = userProfile?.riskAppetite
    ? getRiskAdjustedThresholds(userProfile.riskAppetite)
    : WELLNESS_THRESHOLDS

  // Use the user's actual monthly expenses when available, otherwise fall back to default
  const monthlyExpenses = parseMonthlyExpenses(userProfile?.monthlyExpensesRange) ?? T.MONTHLY_EXPENSES
  const annualIncome = parseAnnualIncome(userProfile?.incomeRange)
  const financialGoals = userProfile?.financialGoals || []

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

  // Calculate total debt from all assets
  const totalDebt = assets.reduce((sum, a) => sum + getAssetDebt(a), 0)
  const debtToAssetRatio = total > 0 ? totalDebt / total : 0

  // --- Factor 1: Diversification (category-level) ---
  const maxCategoryPct = Math.max(...Object.values(byCategory)) / total
  const diversificationScore = maxCategoryPct <= T.DIVERSIFICATION_MAX
    ? W.diversification
    : clampScore(W.diversification * (1 - (maxCategoryPct - T.DIVERSIFICATION_MAX) / 0.6), W.diversification)

  // --- Factor 2: Liquidity (weighted by category liquidity) ---
  // Use CATEGORY_LIQUIDITY to weight each asset's contribution
  const weightedLiquidity = assets.reduce((sum, a) => {
    const cat = (a.category === 'CRYPTO' && isStablecoin(a.ticker)) ? 'CASH' : a.category
    const liquidityFactor = CATEGORY_LIQUIDITY[cat] ?? 0.3
    return sum + (a.value * liquidityFactor)
  }, 0)
  const liquidityRatio = weightedLiquidity / total
  const liquidityScore = liquidityRatio >= T.LIQUIDITY_TARGET
    ? W.liquidity
    : clampScore(W.liquidity * (liquidityRatio / T.LIQUIDITY_TARGET), W.liquidity)

  // --- Factor 3: Crypto & FOREX Volatility Exposure ---
  // Volatile crypto (excluding stablecoins) + FOREX should be limited
  const cryptoRatio = (byCategory.CRYPTO || 0) / total
  const forexRatio = (byCategory.FOREX || 0) / total
  const volatileRatio = cryptoRatio + forexRatio
  const cryptoScore = volatileRatio <= T.CRYPTO_MAX
    ? W.cryptoExposure
    : clampScore(W.cryptoExposure * (1 - (volatileRatio - T.CRYPTO_MAX) / 0.7), W.cryptoExposure)

  // --- Factor 4: Emergency Fund (uses actual user expenses when available) ---
  const cashTotal = byCategory.CASH || 0
  const monthsCovered = cashTotal / monthlyExpenses
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

  // --- Factor 7: Income-Generating Assets (weighted by actual yields) ---
  // Count assets that generate income, weighted by their yield
  let incomeValue = 0
  let weightedYield = 0
  assets.forEach((a) => {
    const assetYield = getAssetYield(a)
    // Categories that inherently generate income
    const isIncomeCategory = ['BONDS', 'CPF'].includes(a.category)
    // Or has explicit yield data above threshold
    const hasGoodYield = assetYield >= (T.MIN_YIELD_THRESHOLD / 100)
    
    if (isIncomeCategory || hasGoodYield) {
      incomeValue += a.value
      weightedYield += a.value * assetYield
    }
  })
  const incomeRatio = incomeValue / total
  const avgYield = incomeValue > 0 ? weightedYield / incomeValue : 0
  // Bonus for higher yields (up to 20% boost for 5%+ avg yield)
  const yieldBonus = Math.min(0.2, avgYield * 4)
  const incomeScore = clampScore(
    W.incomeGenerating * Math.min(1.2, (incomeRatio / T.INCOME_GENERATING_TARGET) * (1 + yieldBonus)),
    W.incomeGenerating
  )

  // --- Factor 8: Debt Health (NEW) ---
  // Lower debt-to-asset ratio is better
  const debtScore = debtToAssetRatio <= T.DEBT_TO_ASSET_MAX
    ? W.debtHealth
    : clampScore(W.debtHealth * (1 - (debtToAssetRatio - T.DEBT_TO_ASSET_MAX) / 0.5), W.debtHealth)

  // --- Factor 9: Rebalancing Alert ---
  const maxDrift = Object.entries(TARGET_ALLOCATION).reduce((max, [cat, target]) => {
    const actual = (byCategory[cat] || 0) / total
    return Math.max(max, Math.abs(actual - target))
  }, 0)
  const rebalanceScore = maxDrift <= T.REBALANCING_DRIFT_MAX
    ? W.rebalancingAlert
    : clampScore(W.rebalancingAlert * (1 - (maxDrift - T.REBALANCING_DRIFT_MAX) / 0.40), W.rebalancingAlert)

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
    concentrationScore + growthScore + incomeScore + debtScore + rebalanceScore +
    savingsScore
  ))

  const breakdown = [
    {
      label: 'Diversification',
      score: diversificationScore,
      max: W.diversification,
      detail: `Largest category: ${(maxCategoryPct * 100).toFixed(1)}%`,
      status: maxCategoryPct <= T.DIVERSIFICATION_MAX ? 'pass' : 'fail',
      goalHint: goalHints.diversification || null,
    },
    {
      label: 'Liquidity',
      score: liquidityScore,
      max: W.liquidity,
      detail: `Weighted liquidity: ${(liquidityRatio * 100).toFixed(1)}%`,
      status: liquidityRatio >= T.LIQUIDITY_TARGET ? 'pass' : 'fail',
      goalHint: goalHints.liquidity || null,
    },
    {
      label: 'Volatility',
      score: cryptoScore,
      max: W.cryptoExposure,
      detail: `Crypto + FOREX: ${(volatileRatio * 100).toFixed(1)}%`,
      status: volatileRatio <= T.CRYPTO_MAX ? 'pass' : 'fail',
      goalHint: goalHints.volatility || null,
    },
    {
      label: 'Emergency Fund',
      score: emergencyScore,
      max: W.emergencyFund,
      detail: `${monthsCovered.toFixed(1)} months covered (based on S$${monthlyExpenses.toLocaleString()}/mo expenses)`,
      status: monthsCovered >= T.EMERGENCY_FUND_MONTHS ? 'pass' : 'fail',
      goalHint: goalHints.emergencyFund || null,
    },
    {
      label: 'Concentration',
      score: concentrationScore,
      max: W.concentrationRisk,
      detail: `Largest asset: ${(maxAssetPct * 100).toFixed(1)}%`,
      status: maxAssetPct <= T.SINGLE_ASSET_MAX ? 'pass' : 'fail',
      goalHint: goalHints.concentration || null,
    },
    {
      label: 'Growth Trend',
      score: growthScore,
      max: W.assetGrowthTrend,
      detail: monthlyChangePct !== null ? `${monthlyChangePct >= 0 ? '+' : ''}${monthlyChangePct.toFixed(1)}% monthly` : 'No data yet',
      status: monthlyChangePct === null ? 'neutral' : monthlyChangePct >= 0 ? 'pass' : 'fail',
      goalHint: goalHints.growthTrend || null,
    },
    {
      label: 'Income Assets',
      score: incomeScore,
      max: W.incomeGenerating,
      detail: `${(incomeRatio * 100).toFixed(1)}% income-gen${avgYield > 0 ? ` (${(avgYield * 100).toFixed(1)}% avg yield)` : ''}`,
      status: incomeRatio >= T.INCOME_GENERATING_TARGET ? 'pass' : 'fail',
      goalHint: goalHints.incomeAssets || null,
    },
    {
      label: 'Debt Health',
      score: debtScore,
      max: W.debtHealth,
      detail: totalDebt > 0 ? `${(debtToAssetRatio * 100).toFixed(1)}% debt ratio` : 'No debt recorded',
      status: debtToAssetRatio <= T.DEBT_TO_ASSET_MAX ? 'pass' : 'fail',
      goalHint: goalHints.debtHealth || null,
    },
    {
      label: 'Rebalancing',
      score: rebalanceScore,
      max: W.rebalancingAlert,
      detail: `Max drift: ${(maxDrift * 100).toFixed(1)}%`,
      status: maxDrift <= T.REBALANCING_DRIFT_MAX ? 'pass' : 'fail',
      goalHint: goalHints.rebalancing || null,
    },
    {
      label: 'Savings Rate',
      score: savingsScore,
      max: W.savingsRate,
      detail: savingsDetail,
      status: savingsStatus,
      goalHint: goalHints.savingsRate || null,
    },
  ]

  return { score, breakdown, goalHints }
}

/**
 * Build goal-specific hint strings based on the user's selected financial goals
 * and current portfolio state.
 */
function buildGoalHints(goals, ctx) {
  if (!goals || !goals.length) return {}
  const hints = {}

  if (goals.includes('Build emergency fund')) {
    if (ctx.emergencyMonths < ctx.targetEmergencyMonths) {
      const gap = Math.ceil((ctx.targetEmergencyMonths - ctx.emergencyMonths) * ctx.monthlyExpenses)
      hints.emergencyFund = `Your goal: build emergency fund. ~S$${gap.toLocaleString()} more needed to reach ${ctx.targetEmergencyMonths}-month target.`
    } else {
      hints.emergencyFund = 'Your emergency fund goal is met — consider redirecting surplus to investments.'
    }
  }

  if (goals.includes('Pay down debt')) {
    hints.debtHealth = ctx.debtRatio > 0.3
      ? 'Your goal: pay down debt. Focus extra cash on highest-interest liabilities first.'
      : 'Your goal: pay down debt. Debt ratio is manageable — maintain steady repayments.'
  }

  if (goals.includes('Buy a home')) {
    if (!ctx.hasProperty) {
      hints.savingsRate = 'Your goal: buy a home. Maximise savings rate to build a down-payment fund.'
      hints.liquidity = 'Your goal: buy a home. Keep liquidity high for an upcoming down payment.'
    } else {
      hints.debtHealth = hints.debtHealth || 'You own property — consider accelerating mortgage repayment.'
    }
  }

  if (goals.includes('Save for retirement')) {
    hints.incomeAssets = 'Your goal: retire comfortably. Prioritise CPF top-ups, bonds, and dividend stocks.'
    hints.growthTrend = hints.growthTrend || 'Long-term growth matters for retirement — stay invested through market cycles.'
  }

  if (goals.includes('Grow wealth')) {
    hints.diversification = 'Your goal: grow wealth. Broad diversification protects long-term compounding.'
    hints.growthTrend = 'Your goal: grow wealth. Consistent positive monthly growth is key.'
  }

  if (goals.includes('Generate passive income')) {
    hints.incomeAssets = hints.incomeAssets || 'Your goal: passive income. Increase allocation to dividend stocks, REITs, and bonds.'
  }

  return hints
}
