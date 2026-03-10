import { useState, useMemo } from 'react'
import { Sliders, TrendingUp, TrendingDown, RefreshCcw, Zap, ArrowRight, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import { ASSET_CATEGORIES } from '../../../shared/constants.js'

const SCENARIOS = [
  {
    id: 'add_cash',
    label: 'Add to Emergency Fund',
    description: 'Simulate adding cash savings',
    icon: TrendingUp,
    type: 'add',
    category: 'CASH',
    defaultValue: 5000,
    min: 1000,
    max: 50000,
    step: 1000,
    unit: 'SGD',
  },
  {
    id: 'pay_debt',
    label: 'Pay Down Debt',
    description: 'Simulate reducing property loans',
    icon: CreditCard,
    type: 'reduce_debt',
    category: 'PROPERTY',
    defaultValue: 10000,
    min: 1000,
    max: 100000,
    step: 5000,
    unit: 'SGD',
  },
  {
    id: 'market_crash',
    label: 'Market Downturn',
    description: 'Simulate stocks & crypto drop',
    icon: TrendingDown,
    type: 'multiply',
    categories: ['STOCKS', 'CRYPTO'],
    defaultValue: -20,
    min: -50,
    max: 0,
    step: 5,
    unit: '%',
  },
  {
    id: 'crypto_rally',
    label: 'Crypto Rally',
    description: 'Simulate crypto price surge',
    icon: Zap,
    type: 'multiply',
    categories: ['CRYPTO'],
    defaultValue: 50,
    min: 0,
    max: 200,
    step: 10,
    unit: '%',
  },
  {
    id: 'rebalance_to_stocks',
    label: 'Rebalance to Stocks',
    description: 'Move crypto to diversified stocks',
    icon: RefreshCcw,
    type: 'transfer',
    from: 'CRYPTO',
    to: 'STOCKS',
    defaultValue: 25,
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
  },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function applyScenario(assets, scenario, value) {
  if (!assets.length) return assets

  return assets.map((asset) => {
    const newAsset = { ...asset, details: { ...asset.details } }

    if (scenario.type === 'add' && asset.category === scenario.category) {
      // Distribute the added value proportionally among assets in this category
      const categoryAssets = assets.filter((a) => a.category === scenario.category)
      const share = value / categoryAssets.length
      newAsset.value = asset.value + share
    }

    if (scenario.type === 'multiply' && scenario.categories?.includes(asset.category)) {
      const multiplier = 1 + value / 100
      newAsset.value = asset.value * multiplier
    }

    if (scenario.type === 'reduce_debt' && asset.category === scenario.category) {
      // Reduce remaining loan on property assets
      if (newAsset.details?.remainingLoan) {
        const currentLoan = Number(newAsset.details.remainingLoan) || 0
        const propertyAssets = assets.filter((a) => a.category === scenario.category && a.details?.remainingLoan)
        const share = value / propertyAssets.length
        newAsset.details.remainingLoan = Math.max(0, currentLoan - share)
      }
    }

    if (scenario.type === 'transfer') {
      if (asset.category === scenario.from) {
        const reduction = asset.value * (value / 100)
        newAsset.value = asset.value - reduction
      }
      // For transfers, we'll handle the "to" category after
    }

    return newAsset
  })
}

function applyTransferTo(assets, scenario, value) {
  if (scenario.type !== 'transfer') return assets

  const fromAssets = assets.filter((a) => a.category === scenario.from)
  const totalTransfer = fromAssets.reduce((sum, a) => sum + a.value * (value / 100), 0)

  const toAssets = assets.filter((a) => a.category === scenario.to)

  if (toAssets.length === 0 && totalTransfer > 0) {
    // Create a new synthetic asset for the target category
    return [
      ...assets,
      {
        id: `scenario-${scenario.to}`,
        name: `${ASSET_CATEGORIES[scenario.to] || scenario.to} (Rebalanced)`,
        category: scenario.to,
        value: totalTransfer,
        cost: totalTransfer,
      },
    ]
  }

  // Distribute transfer proportionally to existing assets in target category
  const toTotal = toAssets.reduce((sum, a) => sum + a.value, 0)
  return assets.map((asset) => {
    if (asset.category === scenario.to) {
      const share = toTotal > 0 ? asset.value / toTotal : 1 / toAssets.length
      return { ...asset, value: asset.value + totalTransfer * share }
    }
    return asset
  })
}

export default function ScenarioSimulator({ assets }) {
  const [expanded, setExpanded] = useState(true)
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0])
  const [sliderValue, setSliderValue] = useState(SCENARIOS[0].defaultValue)

  const currentScore = useMemo(() => calculateWellnessScore(assets), [assets])
  const currentStatus = useMemo(() => getWellnessStatus(currentScore.score), [currentScore.score])

  const projectedAssets = useMemo(() => {
    let modified = applyScenario(assets, activeScenario, sliderValue)
    modified = applyTransferTo(modified, activeScenario, sliderValue)
    return modified
  }, [assets, activeScenario, sliderValue])

  const projectedScore = useMemo(() => calculateWellnessScore(projectedAssets), [projectedAssets])
  const projectedStatus = useMemo(() => getWellnessStatus(projectedScore.score), [projectedScore.score])

  const scoreDelta = projectedScore.score - currentScore.score

  function handleScenarioChange(scenario) {
    setActiveScenario(scenario)
    setSliderValue(scenario.defaultValue)
  }

  function formatValue(value, scenario) {
    if (scenario.unit === 'SGD') {
      return formatCurrency(value)
    }
    return `${value > 0 ? '+' : ''}${value}%`
  }

  const totalCurrent = assets.reduce((sum, a) => sum + a.value, 0)
  const totalProjected = projectedAssets.reduce((sum, a) => sum + a.value, 0)
  const netWorthDelta = totalProjected - totalCurrent

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-purple-500/10">
            <Sliders className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">What-If Scenarios</p>
            <p className="text-xs text-white/40">Simulate changes and see projected impact</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-white/30" />
        ) : (
          <ChevronDown className="h-4 w-4 text-white/30" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-5">
          {/* Scenario Selector */}
          <div className="grid grid-cols-4 gap-2">
            {SCENARIOS.map((scenario) => {
              const Icon = scenario.icon
              const isActive = activeScenario.id === scenario.id
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleScenarioChange(scenario)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isActive
                      ? 'border-purple-400/30 bg-purple-400/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                  }`}
                >
                  <Icon className={`h-4 w-4 mb-2 ${isActive ? 'text-purple-400' : 'text-white/40'}`} />
                  <p className={`text-xs font-semibold ${isActive ? 'text-purple-300' : 'text-white/70'}`}>
                    {scenario.label}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5">{scenario.description}</p>
                </button>
              )
            })}
          </div>

          {/* Slider Control */}
          <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-white/60">{activeScenario.label}</p>
              <span className="text-sm font-semibold text-purple-300">
                {formatValue(sliderValue, activeScenario)}
              </span>
            </div>
            <input
              type="range"
              min={activeScenario.min}
              max={activeScenario.max}
              step={activeScenario.step}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${
                  ((sliderValue - activeScenario.min) / (activeScenario.max - activeScenario.min)) * 100
                }%, rgba(255,255,255,0.1) ${
                  ((sliderValue - activeScenario.min) / (activeScenario.max - activeScenario.min)) * 100
                }%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
            <div className="flex justify-between mt-2 text-[10px] text-white/30">
              <span>{formatValue(activeScenario.min, activeScenario)}</span>
              <span>{formatValue(activeScenario.max, activeScenario)}</span>
            </div>
          </div>

          {/* Results Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current */}
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Current</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold" style={{ color: currentStatus.color }}>
                  {currentScore.score}
                </span>
                <span className="text-sm text-white/30">/100</span>
              </div>
              <p className="text-xs mt-1" style={{ color: currentStatus.color }}>
                {currentStatus.label}
              </p>
              <p className="text-xs text-white/40 mt-2">{formatCurrency(totalCurrent)}</p>
            </div>

            {/* Projected */}
            <div className="p-4 rounded-xl border border-purple-400/20 bg-purple-400/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-purple-300/60 mb-2">Projected</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold" style={{ color: projectedStatus.color }}>
                  {projectedScore.score}
                </span>
                <span className="text-sm text-white/30">/100</span>
                {scoreDelta !== 0 && (
                  <span
                    className={`text-sm font-semibold ${
                      scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                  </span>
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: projectedStatus.color }}>
                {projectedStatus.label}
              </p>
              <p className="text-xs text-white/40 mt-2">
                {formatCurrency(totalProjected)}
                {netWorthDelta !== 0 && (
                  <span className={netWorthDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {' '}({netWorthDelta > 0 ? '+' : ''}{formatCurrency(netWorthDelta)})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Factor Changes */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Factor Impact</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {projectedScore.breakdown.map((item, i) => {
                const current = currentScore.breakdown[i]
                const delta = current ? item.score - current.score : 0
                return (
                  <div
                    key={item.label}
                    className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]"
                  >
                    <p className="text-xs text-white/50 mb-1">{item.label}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-white/80">
                        {item.score}/{item.max}
                      </span>
                      {delta !== 0 && (
                        <span
                          className={`text-xs font-semibold ${
                            delta > 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {delta > 0 ? '+' : ''}{delta}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Insight */}
          {scoreDelta !== 0 && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${
                scoreDelta > 0
                  ? 'border-emerald-400/20 bg-emerald-400/[0.04]'
                  : 'border-red-400/20 bg-red-400/[0.04]'
              }`}
            >
              <ArrowRight
                className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              />
              <div>
                <p className={`text-sm font-semibold ${scoreDelta > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {scoreDelta > 0 ? 'Improvement projected' : 'Score would decrease'}
                </p>
                <p className="text-xs text-white/50 mt-1">
                  {scoreDelta > 0
                    ? `This change would improve your wellness score by ${scoreDelta} points, moving you ${
                        projectedStatus.label !== currentStatus.label
                          ? `from "${currentStatus.label}" to "${projectedStatus.label}"`
                          : 'closer to your goals'
                      }.`
                    : `This scenario would reduce your score by ${Math.abs(scoreDelta)} points. ${
                        activeScenario.type === 'multiply' && activeScenario.defaultValue < 0
                          ? 'Consider building a buffer to weather market downturns.'
                          : 'Review the factor breakdown to understand the impact.'
                      }`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
