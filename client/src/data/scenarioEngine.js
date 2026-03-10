/**
 * Scenario Engine for What-If Analysis
 *
 * Provides 7 Singapore-relevant life and market scenarios with
 * multi-year projection, compound growth, and smart recommendations.
 */

import { calculateWellnessScore } from './wellnessCalculator.js'
import {
  PROJECTION_ASSUMPTIONS,
  BTO_PRICES,
  WELLNESS_THRESHOLDS,
  TARGET_ALLOCATION,
  ASSET_CATEGORIES,
  isStablecoin,
} from '../../../shared/constants.js'

// ── Scenario Definitions ─────────────────────────────────────────

export const SCENARIO_GROUPS = [
  { key: 'life', label: 'Life Events' },
  { key: 'market', label: 'Market Scenarios' },
]

export const SCENARIOS = [
  // ── Life Events ──
  {
    id: 'bto_savings',
    group: 'life',
    label: 'Save for BTO',
    description: 'Down payment savings plan',
    params: [
      { key: 'flatType', type: 'select', label: 'Flat Type', options: Object.keys(BTO_PRICES), default: '4-Room' },
      { key: 'monthly', type: 'slider', label: 'Monthly Savings', min: 500, max: 3000, step: 100, default: 1000, unit: 'SGD' },
      { key: 'years', type: 'slider', label: 'Time Horizon', min: 1, max: 5, step: 1, default: 3, unit: 'years' },
    ],
  },
  {
    id: 'job_loss',
    group: 'life',
    label: 'Job Loss',
    description: 'Stress-test your runway',
    params: [
      { key: 'expenses', type: 'slider', label: 'Monthly Expenses', min: 1000, max: 8000, step: 500, default: WELLNESS_THRESHOLDS.MONTHLY_EXPENSES, unit: 'SGD' },
      { key: 'months', type: 'slider', label: 'Duration', min: 3, max: 12, step: 1, default: 6, unit: 'months' },
    ],
  },
  {
    id: 'start_dca',
    group: 'life',
    label: 'Start Investing',
    description: 'Dollar-cost average monthly',
    params: [
      { key: 'monthly', type: 'slider', label: 'Monthly Amount', min: 100, max: 3000, step: 100, default: 500, unit: 'SGD' },
      { key: 'target', type: 'select', label: 'Invest Into', options: ['STOCKS', 'BONDS', 'CRYPTO'], default: 'STOCKS' },
      { key: 'years', type: 'slider', label: 'Time Horizon', min: 1, max: 10, step: 1, default: 5, unit: 'years' },
    ],
  },
  {
    id: 'build_emergency',
    group: 'life',
    label: 'Emergency Fund',
    description: 'Build your cash buffer',
    params: [
      { key: 'monthly', type: 'slider', label: 'Monthly Savings', min: 200, max: 2000, step: 100, default: 500, unit: 'SGD' },
      { key: 'years', type: 'slider', label: 'Time Horizon', min: 1, max: 3, step: 1, default: 1, unit: 'years' },
    ],
  },
  // ── Market Scenarios ──
  {
    id: 'market_crash',
    group: 'market',
    label: 'Market Crash',
    description: 'Stress-test against a downturn',
    params: [
      { key: 'severity', type: 'select', label: 'Severity', options: ['Mild (-15%)', 'Bear (-30%)', 'Severe (-50%)'], default: 'Bear (-30%)' },
      { key: 'recoveryYears', type: 'slider', label: 'Recovery Period', min: 1, max: 5, step: 1, default: 3, unit: 'years' },
    ],
  },
  {
    id: 'crypto_bull',
    group: 'market',
    label: 'Crypto Bull Run',
    description: 'Crypto surge with take-profit',
    params: [
      { key: 'multiplier', type: 'slider', label: 'Price Multiplier', min: 1.5, max: 5, step: 0.5, default: 2, unit: 'x' },
      { key: 'takeProfit', type: 'slider', label: 'Take Profit', min: 0, max: 100, step: 10, default: 0, unit: '%' },
    ],
  },
  {
    id: 'rebalance',
    group: 'market',
    label: 'Smart Rebalance',
    description: 'Realign to target allocation',
    params: [
      { key: 'intensity', type: 'slider', label: 'Rebalance Intensity', min: 10, max: 100, step: 10, default: 50, unit: '%' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────

function deepCloneAssets(assets) {
  return assets.map(a => ({
    ...a,
    details: a.details ? { ...a.details } : {},
  }))
}

function sumValues(assets) {
  return assets.reduce((s, a) => s + (a.value || 0), 0)
}

function getCategoryTotal(assets, category) {
  return assets.filter(a => a.category === category).reduce((s, a) => s + a.value, 0)
}

function getCashTotal(assets) {
  // Include stablecoins reclassified as cash
  return assets.reduce((s, a) => {
    if (a.category === 'CASH') return s + a.value
    if (a.category === 'CRYPTO' && isStablecoin(a.ticker)) return s + a.value
    return s
  }, 0)
}

function parseSeverity(label) {
  if (label.includes('-15')) return -0.15
  if (label.includes('-50')) return -0.50
  return -0.30 // default bear
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatCompact(value) {
  if (Math.abs(value) >= 1_000_000) return `SGD ${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `SGD ${(value / 1_000).toFixed(0)}K`
  return formatCurrency(value)
}

// ── Projection Engine ────────────────────────────────────────────

function applyMonthlyGrowth(assets) {
  const R = PROJECTION_ASSUMPTIONS.ANNUAL_RETURNS
  return assets.map(a => ({
    ...a,
    value: a.value * (1 + (R[a.category] || 0) / 12),
  }))
}

function addToCategory(assets, category, amount) {
  const catAssets = assets.filter(a => a.category === category)
  if (catAssets.length === 0) {
    // Create a synthetic asset
    assets.push({
      id: `projected-${category}`,
      name: `${ASSET_CATEGORIES[category] || category} (Projected)`,
      category,
      value: amount,
      cost: amount,
      details: {},
    })
    return assets
  }
  const share = amount / catAssets.length
  return assets.map(a =>
    a.category === category ? { ...a, value: a.value + share } : a,
  )
}

function deductFromCategories(assets, amount, order = ['CASH', 'STOCKS', 'CRYPTO']) {
  let remaining = amount
  const result = assets.map(a => ({ ...a }))

  for (const cat of order) {
    if (remaining <= 0) break
    const catAssets = result.filter(a => a.category === cat && a.value > 0)
    const catTotal = catAssets.reduce((s, a) => s + a.value, 0)
    const deduction = Math.min(remaining, catTotal)

    if (deduction > 0 && catTotal > 0) {
      for (const a of catAssets) {
        const share = a.value / catTotal
        a.value = Math.max(0, a.value - deduction * share)
      }
      remaining -= deduction
    }
  }

  return result
}

/**
 * Project a scenario over time, returning data points for charting.
 *
 * @param {Array} assets - Current asset list
 * @param {string} scenarioId - One of the SCENARIOS[].id values
 * @param {Object} params - User-configured parameters for the scenario
 * @returns {Array<{ month, label, netWorth, wellnessScore }>}
 */
export function projectScenario(assets, scenarioId, params) {
  if (!assets.length) return []

  const dataPoints = []
  let current = deepCloneAssets(assets)

  // Record starting point
  const startScore = calculateWellnessScore(current)
  dataPoints.push({
    month: 0,
    label: 'Now',
    netWorth: sumValues(current),
    wellnessScore: startScore.score,
  })

  // Determine total months for projection
  let totalMonths
  switch (scenarioId) {
    case 'bto_savings':
    case 'start_dca':
      totalMonths = (params.years || 3) * 12
      break
    case 'build_emergency':
      totalMonths = (params.years || 1) * 12
      break
    case 'job_loss':
      totalMonths = params.months || 6
      break
    case 'market_crash':
      totalMonths = (params.recoveryYears || 3) * 12
      break
    case 'crypto_bull':
    case 'rebalance':
      totalMonths = 12 // show 1-year outlook after the event
      break
    default:
      totalMonths = 12
  }

  // For instant scenarios (market crash, crypto bull, rebalance), apply shock at month 0
  if (scenarioId === 'market_crash') {
    const drop = parseSeverity(params.severity || 'Bear (-30%)')
    const cryptoDrop = drop * 1.5 // crypto drops harder
    current = current.map(a => {
      if (a.category === 'STOCKS') return { ...a, value: a.value * (1 + drop) }
      if (a.category === 'CRYPTO' && !isStablecoin(a.ticker)) return { ...a, value: a.value * (1 + Math.max(-0.95, cryptoDrop)) }
      return a
    })
    // Record post-crash point
    const crashScore = calculateWellnessScore(current)
    dataPoints.push({
      month: 1,
      label: 'M1',
      netWorth: sumValues(current),
      wellnessScore: crashScore.score,
    })
  }

  if (scenarioId === 'crypto_bull') {
    const mult = params.multiplier || 2
    const takeProfit = (params.takeProfit || 0) / 100
    let cryptoGains = 0

    current = current.map(a => {
      if (a.category === 'CRYPTO' && !isStablecoin(a.ticker)) {
        const newValue = a.value * mult
        const gain = newValue - a.value
        cryptoGains += gain * takeProfit
        return { ...a, value: newValue - gain * takeProfit }
      }
      return a
    })

    // Move take-profit gains to STOCKS
    if (cryptoGains > 0) {
      current = addToCategory(current, 'STOCKS', cryptoGains)
    }

    const bullScore = calculateWellnessScore(current)
    dataPoints.push({
      month: 1,
      label: 'M1',
      netWorth: sumValues(current),
      wellnessScore: bullScore.score,
    })
  }

  if (scenarioId === 'rebalance') {
    const intensity = (params.intensity || 50) / 100
    const total = sumValues(current)

    current = current.map(a => {
      const catTarget = TARGET_ALLOCATION[a.category] || 0
      const catActual = a.value / total
      const catAssets = current.filter(x => x.category === a.category)
      const catTotal = catAssets.reduce((s, x) => s + x.value, 0)
      const targetTotal = catTarget * total
      const diff = targetTotal - catTotal
      const adjustment = diff * intensity
      const share = catTotal > 0 ? a.value / catTotal : 1 / catAssets.length
      return { ...a, value: Math.max(0, a.value + adjustment * share) }
    })

    const rebalScore = calculateWellnessScore(current)
    dataPoints.push({
      month: 1,
      label: 'M1',
      netWorth: sumValues(current),
      wellnessScore: rebalScore.score,
    })
  }

  // Starting month for the loop (skip 1 if we already recorded post-shock)
  const startMonth = ['market_crash', 'crypto_bull', 'rebalance'].includes(scenarioId) ? 2 : 1

  // Recovery rate for crash scenario (monthly linear recovery)
  const crashDrop = scenarioId === 'market_crash' ? parseSeverity(params.severity || 'Bear (-30%)') : 0
  const recoveryMonths = scenarioId === 'market_crash' ? (params.recoveryYears || 3) * 12 : 0
  const monthlyRecoveryRate = recoveryMonths > 0 ? Math.abs(crashDrop) / recoveryMonths : 0

  for (let m = startMonth; m <= totalMonths; m++) {
    // 1. Apply monthly growth
    current = applyMonthlyGrowth(current)

    // 2. Scenario-specific monthly actions
    switch (scenarioId) {
      case 'bto_savings':
      case 'build_emergency':
        current = addToCategory(current, 'CASH', params.monthly || 500)
        break

      case 'start_dca':
        current = addToCategory(current, params.target || 'STOCKS', params.monthly || 500)
        break

      case 'job_loss':
        if (m <= (params.months || 6)) {
          current = deductFromCategories(current, params.expenses || 3000)
        }
        break

      case 'market_crash':
        // Gradual recovery: grow STOCKS and CRYPTO by recovery rate
        if (monthlyRecoveryRate > 0) {
          current = current.map(a => {
            if (a.category === 'STOCKS') return { ...a, value: a.value * (1 + monthlyRecoveryRate) }
            if (a.category === 'CRYPTO' && !isStablecoin(a.ticker)) return { ...a, value: a.value * (1 + monthlyRecoveryRate * 1.2) }
            return a
          })
        }
        break

      // crypto_bull and rebalance just grow naturally after the initial event
    }

    // Record data point every 3 months, or at the end, or every month for short scenarios
    const isShortScenario = totalMonths <= 12
    const shouldRecord = m === totalMonths || (isShortScenario ? m % 1 === 0 : m % 3 === 0)

    if (shouldRecord) {
      const score = calculateWellnessScore(current)
      const yearNum = Math.floor(m / 12)
      const monthNum = m % 12
      dataPoints.push({
        month: m,
        label: totalMonths <= 12
          ? `M${m}`
          : yearNum > 0 && monthNum === 0
            ? `Y${yearNum}`
            : `Y${yearNum}`,
        netWorth: sumValues(current),
        wellnessScore: score.score,
      })
    }
  }

  return dataPoints
}

// ── Smart Recommendations ────────────────────────────────────────

/**
 * Generate 2-3 contextual recommendations based on the user's actual
 * portfolio and the scenario they are exploring.
 */
export function generateRecommendations(assets, scenarioId, params, projection) {
  const recommendations = []
  if (!assets.length || !projection.length) return recommendations

  const currentScore = calculateWellnessScore(assets)
  const finalPoint = projection[projection.length - 1]
  const total = sumValues(assets)
  const cashTotal = getCashTotal(assets)

  // Category totals
  const byCategory = {}
  assets.forEach(a => {
    const cat = (a.category === 'CRYPTO' && isStablecoin(a.ticker)) ? 'CASH' : a.category
    byCategory[cat] = (byCategory[cat] || 0) + a.value
  })

  switch (scenarioId) {
    case 'bto_savings': {
      const price = BTO_PRICES[params.flatType || '4-Room'] || 350000
      const downPayment = price * 0.10
      const totalSaved = cashTotal + (params.monthly || 1000) * (params.years || 3) * 12
      const pctFunded = Math.min(100, (totalSaved / downPayment) * 100)

      if (pctFunded < 100) {
        const needed = downPayment - cashTotal
        const requiredMonthly = Math.ceil(needed / ((params.years || 3) * 12) / 100) * 100
        recommendations.push({
          priority: 'high',
          title: `${pctFunded.toFixed(0)}% of down payment funded`,
          detail: `A ${params.flatType || '4-Room'} BTO needs ~${formatCurrency(downPayment)} down (10%). At ${formatCurrency(params.monthly || 1000)}/month you'll reach ${formatCurrency(totalSaved)} in ${params.years || 3} years. ${requiredMonthly > (params.monthly || 1000) ? `Consider increasing to ${formatCurrency(requiredMonthly)}/month.` : 'You\'re on track!'}`,
        })
      } else {
        recommendations.push({
          priority: 'info',
          title: 'Down payment target achievable',
          detail: `At ${formatCurrency(params.monthly || 1000)}/month, you'll have enough for the ${params.flatType || '4-Room'} 10% down payment within ${params.years || 3} years. Consider also saving for renovation (~SGD 30-50K).`,
        })
      }

      // CPF OA tip
      const cpfAssets = assets.filter(a => a.category === 'CPF')
      if (cpfAssets.length > 0) {
        const cpfTotal = cpfAssets.reduce((s, a) => s + a.value, 0)
        recommendations.push({
          priority: 'info',
          title: 'CPF OA can contribute',
          detail: `Your CPF balance of ${formatCurrency(cpfTotal)} can be used for HDB purchases (up to Valuation Limit). This reduces the cash down payment needed.`,
        })
      }
      break
    }

    case 'job_loss': {
      const monthsCovered = cashTotal / (params.expenses || 3000)
      const targetMonths = params.months || 6

      if (monthsCovered < targetMonths) {
        const shortfall = (targetMonths - monthsCovered) * (params.expenses || 3000)
        recommendations.push({
          priority: 'high',
          title: `Cash covers ${monthsCovered.toFixed(1)} of ${targetMonths} months`,
          detail: `You'd need to liquidate ~${formatCurrency(shortfall)} from investments. Build your emergency fund to ${formatCurrency((params.expenses || 3000) * targetMonths)} to avoid forced selling at a loss.`,
        })
      } else {
        recommendations.push({
          priority: 'info',
          title: `Cash covers ${monthsCovered.toFixed(1)} months — sufficient`,
          detail: `Your emergency fund can sustain ${targetMonths} months of expenses without touching investments. Strong position.`,
        })
      }

      // Illiquid concentration warning
      const illiquidPct = ((byCategory.PROPERTY || 0) + (byCategory.CPF || 0)) / total
      if (illiquidPct > 0.5) {
        recommendations.push({
          priority: 'medium',
          title: `${(illiquidPct * 100).toFixed(0)}% is illiquid`,
          detail: `Property and CPF cannot be accessed in emergencies. Consider keeping more in liquid assets (cash, stocks, bonds) for flexibility.`,
        })
      }
      break
    }

    case 'start_dca': {
      const annualReturn = PROJECTION_ASSUMPTIONS.ANNUAL_RETURNS[params.target || 'STOCKS'] || 0.07
      const totalInvested = (params.monthly || 500) * (params.years || 5) * 12
      const projectedValue = finalPoint.netWorth - sumValues(assets) + totalInvested // approximate gain from DCA
      const estimatedGain = projectedValue - totalInvested

      recommendations.push({
        priority: 'info',
        title: `${formatCurrency(totalInvested)} invested over ${params.years || 5} years`,
        detail: `At a historical average of ${(annualReturn * 100).toFixed(0)}% annual return for ${ASSET_CATEGORIES[params.target || 'STOCKS'] || params.target}, your investments could grow to ~${formatCompact(finalPoint.netWorth)}. Starting early maximises compound growth.`,
      })

      if ((params.monthly || 500) < 1000 && total > 50000) {
        recommendations.push({
          priority: 'medium',
          title: 'Consider increasing contributions',
          detail: `With a ${formatCurrency(total)} portfolio, investing ${formatCurrency(params.monthly || 500)}/month is modest. Even ${formatCurrency((params.monthly || 500) + 200)}/month adds ${formatCurrency(200 * (params.years || 5) * 12)} more over ${params.years || 5} years.`,
        })
      }
      break
    }

    case 'build_emergency': {
      const currentMonths = cashTotal / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
      const futureMonths = (cashTotal + (params.monthly || 500) * (params.years || 1) * 12) / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
      const target = WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS

      recommendations.push({
        priority: currentMonths < target ? 'high' : 'info',
        title: `${currentMonths.toFixed(1)} → ${futureMonths.toFixed(1)} months coverage`,
        detail: futureMonths >= target
          ? `You'll exceed the ${target}-month target. Once reached, redirect savings to investments for higher growth.`
          : `Target is ${target} months (${formatCurrency(WELLNESS_THRESHOLDS.MONTHLY_EXPENSES * target)}). Keep building — this is the #1 factor for financial resilience.`,
      })
      break
    }

    case 'market_crash': {
      const lowestPoint = projection.reduce((min, p) => p.wellnessScore < min.wellnessScore ? p : min)
      const startScore = projection[0]
      const recoveryPoint = projection.find((p, i) => i > 1 && p.wellnessScore >= startScore.wellnessScore)

      recommendations.push({
        priority: 'info',
        title: 'Recovery timeline',
        detail: recoveryPoint
          ? `Score would bottom at ${lowestPoint.wellnessScore} in month ${lowestPoint.month}, then recover by month ${recoveryPoint.month}. Stay invested — selling at the bottom locks in losses.`
          : `Score would drop to ${lowestPoint.wellnessScore}. Full recovery may take longer than ${params.recoveryYears || 3} years. Diversification helps cushion the blow.`,
      })

      const monthsCovered = cashTotal / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
      if (monthsCovered < 6) {
        recommendations.push({
          priority: 'high',
          title: 'Build cash buffer before a downturn',
          detail: `With only ${monthsCovered.toFixed(1)} months of expenses in cash, a crash could force you to sell investments at a loss. Target 6+ months.`,
        })
      }
      break
    }

    case 'crypto_bull': {
      const cryptoPct = (byCategory.CRYPTO || 0) / total
      const mult = params.multiplier || 2
      const newCryptoPct = (cryptoPct * mult) / (1 + cryptoPct * (mult - 1))

      if (newCryptoPct > 0.3) {
        recommendations.push({
          priority: 'high',
          title: 'Take profit to maintain balance',
          detail: `At ${mult}x, crypto would be ${(newCryptoPct * 100).toFixed(0)}% of your portfolio — well above the 30% threshold. Use the take-profit slider to rebalance gains into stocks.`,
        })
      }

      if ((params.takeProfit || 0) > 0) {
        const gains = (byCategory.CRYPTO || 0) * (mult - 1)
        const profitTaken = gains * (params.takeProfit / 100)
        recommendations.push({
          priority: 'info',
          title: `${formatCurrency(profitTaken)} rebalanced to stocks`,
          detail: `Taking ${params.takeProfit}% profit diversifies your gains and locks in returns. Your wellness score improves because concentration risk drops.`,
        })
      }
      break
    }

    case 'rebalance': {
      const scoreDelta = finalPoint.wellnessScore - currentScore.score
      recommendations.push({
        priority: scoreDelta > 0 ? 'info' : 'medium',
        title: scoreDelta > 0 ? `+${scoreDelta} points from rebalancing` : 'Rebalancing has limited effect',
        detail: scoreDelta > 0
          ? `Moving ${params.intensity || 50}% toward target allocation improves your score by ${scoreDelta} points. Focus on reducing overweight categories.`
          : `Your portfolio is already close to the target allocation. The ${params.intensity || 50}% rebalance has minimal impact.`,
      })

      // Show which categories are most overweight
      const drifts = Object.entries(TARGET_ALLOCATION)
        .map(([cat, target]) => ({ cat, drift: ((byCategory[cat] || 0) / total) - target }))
        .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))

      if (drifts[0] && Math.abs(drifts[0].drift) > 0.05) {
        const top = drifts[0]
        const direction = top.drift > 0 ? 'overweight' : 'underweight'
        recommendations.push({
          priority: 'medium',
          title: `${ASSET_CATEGORIES[top.cat] || top.cat} is ${direction}`,
          detail: `${(Math.abs(top.drift) * 100).toFixed(1)}% away from target. ${top.drift > 0 ? 'Consider trimming this position.' : 'Consider adding to this category.'}`,
        })
      }
      break
    }
  }

  // Universal fallback: if we have < 3 recs, add the worst-performing factor
  if (recommendations.length < 3) {
    const failingFactors = currentScore.breakdown
      .filter(f => f.status === 'fail')
      .sort((a, b) => (b.max - b.score) - (a.max - a.score))

    if (failingFactors.length > 0) {
      const worst = failingFactors[0]
      recommendations.push({
        priority: 'medium',
        title: `Focus area: ${worst.label}`,
        detail: `Currently ${worst.score}/${worst.max}. ${worst.detail}. Improving this factor has the biggest impact on your overall score.`,
      })
    }
  }

  return recommendations.slice(0, 3)
}

/**
 * Get a scenario-specific milestone string for the results summary.
 */
export function getScenarioMilestone(assets, scenarioId, params, projection) {
  if (!projection.length) return null
  const finalPoint = projection[projection.length - 1]
  const cashTotal = getCashTotal(assets)

  switch (scenarioId) {
    case 'bto_savings': {
      const price = BTO_PRICES[params.flatType || '4-Room'] || 350000
      const downPayment = price * 0.10
      const totalSaved = cashTotal + (params.monthly || 1000) * (params.years || 3) * 12
      const pct = Math.min(100, (totalSaved / downPayment) * 100)
      return { label: 'Down Payment Progress', value: `${pct.toFixed(0)}%`, color: pct >= 100 ? '#18a871' : '#f0a100' }
    }

    case 'job_loss': {
      const monthsCovered = cashTotal / (params.expenses || 3000)
      const target = params.months || 6
      return {
        label: 'Survivability',
        value: `${Math.min(monthsCovered, target).toFixed(1)} / ${target} months`,
        color: monthsCovered >= target ? '#18a871' : '#e65054',
      }
    }

    case 'start_dca': {
      const totalInvested = (params.monthly || 500) * (params.years || 5) * 12
      return { label: 'Total Invested', value: formatCurrency(totalInvested), color: '#2f7cf6' }
    }

    case 'build_emergency': {
      const futureMonths = (cashTotal + (params.monthly || 500) * (params.years || 1) * 12) / WELLNESS_THRESHOLDS.MONTHLY_EXPENSES
      return {
        label: 'Emergency Coverage',
        value: `${futureMonths.toFixed(1)} months`,
        color: futureMonths >= WELLNESS_THRESHOLDS.EMERGENCY_FUND_MONTHS ? '#18a871' : '#f0a100',
      }
    }

    case 'market_crash': {
      const lowestPoint = projection.reduce((min, p) => p.wellnessScore < min.wellnessScore ? p : min)
      return { label: 'Worst Score', value: `${lowestPoint.wellnessScore}/100`, color: '#e65054' }
    }

    case 'crypto_bull': {
      const cryptoTotal = getCategoryTotal(assets, 'CRYPTO')
      const mult = params.multiplier || 2
      const gain = cryptoTotal * (mult - 1)
      return { label: 'Crypto Gain', value: `+${formatCurrency(gain)}`, color: '#18a871' }
    }

    case 'rebalance': {
      const scoreDelta = finalPoint.wellnessScore - projection[0].wellnessScore
      return {
        label: 'Score Change',
        value: scoreDelta > 0 ? `+${scoreDelta} pts` : `${scoreDelta} pts`,
        color: scoreDelta > 0 ? '#18a871' : scoreDelta < 0 ? '#e65054' : '#2f7cf6',
      }
    }

    default:
      return null
  }
}
