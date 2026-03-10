import { useState, useMemo } from 'react'
import {
  Sliders, Home, Briefcase, TrendingUp, Shield,
  TrendingDown, Zap, RefreshCcw, ArrowRight,
  ChevronDown, ChevronUp, AlertTriangle, Info, CheckCircle,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import {
  SCENARIOS, SCENARIO_GROUPS,
  projectScenario, generateRecommendations, getScenarioMilestone,
  formatCurrency,
} from '../data/scenarioEngine.js'
import { ASSET_CATEGORIES } from '../../../shared/constants.js'

// Map scenario IDs to icons
const SCENARIO_ICONS = {
  bto_savings: Home,
  job_loss: Briefcase,
  start_dca: TrendingUp,
  build_emergency: Shield,
  market_crash: TrendingDown,
  crypto_bull: Zap,
  rebalance: RefreshCcw,
}

const PRIORITY_STYLES = {
  high: 'border-red-400/20 bg-red-400/[0.04]',
  medium: 'border-amber-400/15 bg-amber-400/[0.03]',
  info: 'border-blue-400/15 bg-blue-400/[0.04]',
}

const PRIORITY_ICONS = {
  high: <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />,
  medium: <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />,
  info: <Info className="h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5" />,
}

// ── Chart Tooltip ────────────────────────────────────────────────

function ProjectionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#1a1a2e]/95 px-3 py-2 shadow-xl backdrop-blur text-xs">
      <p className="text-white/50 mb-1">{d.label}</p>
      <p className="text-purple-300 font-semibold">Score: {d.wellnessScore}/100</p>
      <p className="text-cyan-300 font-semibold">{formatCurrency(d.netWorth)}</p>
    </div>
  )
}

// ── Parameter Controls ───────────────────────────────────────────

function ParamSlider({ param, value, onChange }) {
  const displayValue = param.unit === 'SGD'
    ? formatCurrency(value)
    : param.unit === 'x'
      ? `${value}x`
      : param.unit === '%'
        ? `${value}%`
        : `${value} ${param.unit}`

  const pct = ((value - param.min) / (param.max - param.min)) * 100

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-white/50">{param.label}</p>
        <span className="text-xs font-semibold text-purple-300">{displayValue}</span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #A855F7 0%, #A855F7 ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-white/25">
        <span>{param.unit === 'SGD' ? formatCurrency(param.min) : `${param.min}${param.unit === 'x' ? 'x' : param.unit === '%' ? '%' : ''}`}</span>
        <span>{param.unit === 'SGD' ? formatCurrency(param.max) : `${param.max}${param.unit === 'x' ? 'x' : param.unit === '%' ? '%' : ''}`}</span>
      </div>
    </div>
  )
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

export default function ScenarioSimulator({ assets, userProfile }) {
  const [expanded, setExpanded] = useState(true)
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0])
  const [sliderValue, setSliderValue] = useState(SCENARIOS[0].defaultValue)

  const currentScore = useMemo(() => calculateWellnessScore(assets, { userProfile }), [assets, userProfile])
  const currentStatus = useMemo(() => getWellnessStatus(currentScore.score), [currentScore.score])

  const projectedAssets = useMemo(() => {
    let modified = applyScenario(assets, activeScenario, sliderValue)
    modified = applyTransferTo(modified, activeScenario, sliderValue)
    return modified
  }, [assets, activeScenario, sliderValue])

  const projectedScore = useMemo(() => calculateWellnessScore(projectedAssets, { userProfile }), [projectedAssets, userProfile])
  const projectedStatus = useMemo(() => getWellnessStatus(projectedScore.score), [projectedScore.score])

  const scoreDelta = finalPoint ? finalPoint.wellnessScore - currentScore.score : 0
  const totalCurrent = assets.reduce((s, a) => s + a.value, 0)
  const netWorthDelta = finalPoint ? finalPoint.netWorth - totalCurrent : 0

  // Smart recommendations
  const recommendations = useMemo(
    () => generateRecommendations(assets, activeScenarioId, currentParams, projection),
    [assets, activeScenarioId, currentParams, projection],
  )

  // Milestone
  const milestone = useMemo(
    () => getScenarioMilestone(assets, activeScenarioId, currentParams, projection),
    [assets, activeScenarioId, currentParams, projection],
  )

  // Factor breakdown for detail view
  const projectedBreakdown = useMemo(() => {
    if (!finalPoint) return null
    // We need the full breakdown — recalculate for the projected state
    // Use the assets from the final projection by rebuilding them
    // For simplicity, just use the initial projected score comparison
    return null // We'll use current breakdown + delta approach
  }, [finalPoint])

  // Chart data
  const chartData = useMemo(() => {
    if (projection.length < 2) return []
    return projection.map(p => ({
      ...p,
      // Keep netWorth as-is for right axis
    }))
  }, [projection])

  // For factor impact, compute projected score with a simple approach
  const projectedFullScore = useMemo(() => {
    if (!assets.length || !projection.length) return null
    // Run the full calculation on the final projected net worth
    // We approximate by applying the scenario to current assets and scoring
    return null // Factor detail will just show the delta
  }, [assets, projection])

  return (
    <div className="glass-card overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
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
            <p className="text-sm font-semibold text-white/90">What-If Scenario Lab</p>
            <p className="text-xs text-white/40">Simulate life events & market changes, see multi-year projections</p>
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

          {/* ── Scenario Tabs (grouped) ─────────────────────── */}
          {SCENARIO_GROUPS.map(group => {
            const groupScenarios = SCENARIOS.filter(s => s.group === group.key)
            return (
              <div key={group.key}>
                <p className="text-[10px] uppercase tracking-wider text-white/25 mb-2">{group.label}</p>
                <div className={`grid gap-2 ${groupScenarios.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {groupScenarios.map(scenario => {
                    const Icon = SCENARIO_ICONS[scenario.id] || Sliders
                    const isActive = activeScenarioId === scenario.id
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => handleScenarioChange(scenario.id)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          isActive
                            ? 'border-purple-400/30 bg-purple-400/[0.08]'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                        }`}
                      >
                        <Icon className={`h-4 w-4 mb-1.5 ${isActive ? 'text-purple-400' : 'text-white/40'}`} />
                        <p className={`text-xs font-semibold leading-tight ${isActive ? 'text-purple-300' : 'text-white/70'}`}>
                          {scenario.label}
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5 leading-snug">{scenario.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* ── Parameter Controls ──────────────────────────── */}
          <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-4">
            {activeScenario.params.map(param => (
              param.type === 'select' ? (
                <ParamSelect
                  key={param.key}
                  param={param}
                  value={currentParams[param.key] ?? param.default}
                  onChange={(v) => updateParam(param.key, v)}
                />
              ) : (
                <ParamSlider
                  key={param.key}
                  param={param}
                  value={currentParams[param.key] ?? param.default}
                  onChange={(v) => updateParam(param.key, v)}
                />
              )
            ))}
          </div>

          {/* ── Projection Chart ────────────────────────────── */}
          {chartData.length >= 2 && (
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-3">Projected Trajectory</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A855F7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="worthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="score"
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(168,85,247,0.5)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <YAxis
                    yAxisId="worth"
                    orientation="right"
                    tick={{ fill: 'rgba(6,182,212,0.5)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                    width={45}
                  />
                  <Tooltip content={<ProjectionTooltip />} />
                  <Area
                    yAxisId="score"
                    type="monotone"
                    dataKey="wellnessScore"
                    stroke="#A855F7"
                    strokeWidth={2}
                    fill="url(#scoreGrad)"
                    dot={false}
                  />
                  <Area
                    yAxisId="worth"
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    fill="url(#worthGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-purple-400" />
                  <span className="text-[10px] text-white/35">Wellness Score</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="text-[10px] text-white/35">Net Worth</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Results Comparison ──────────────────────────── */}
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
              <p className="text-[10px] uppercase tracking-wider text-purple-300/60 mb-2">
                Projected
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold" style={{ color: projectedStatus.color }}>
                  {finalPoint?.wellnessScore ?? '—'}
                </span>
                <span className="text-sm text-white/30">/100</span>
                {scoreDelta !== 0 && (
                  <span className={`text-sm font-semibold ${scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                  </span>
                )}
              </div>
              <p className="text-xs mt-1" style={{ color: projectedStatus.color }}>
                {projectedStatus.label}
              </p>
              <p className="text-xs text-white/40 mt-2">
                {finalPoint ? formatCurrency(finalPoint.netWorth) : '—'}
                {netWorthDelta !== 0 && (
                  <span className={netWorthDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {' '}({netWorthDelta > 0 ? '+' : ''}{formatCurrency(netWorthDelta)})
                  </span>
                )}
              </p>

              {/* Milestone indicator */}
              {milestone && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <p className="text-[10px] text-white/30">{milestone.label}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: milestone.color }}>
                    {milestone.value}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Smart Recommendations ──────────────────────── */}
          {recommendations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Smart Insights</p>
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border ${PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.info}`}
                >
                  {PRIORITY_ICONS[rec.priority] || PRIORITY_ICONS.info}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/80">{rec.title}</p>
                    <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{rec.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Factor Impact (collapsible) ────────────────── */}
          {currentScore.breakdown.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowFactors(!showFactors)}
                className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors"
              >
                {showFactors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Factor Breakdown
              </button>

              {showFactors && (
                <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 mt-2">
                  {currentScore.breakdown.map((item) => (
                    <div
                      key={item.label}
                      className="p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    >
                      <p className="text-[10px] text-white/40 mb-1">{item.label}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-white/70">
                          {item.score}/{item.max}
                        </span>
                        {item.status === 'pass' && <CheckCircle className="h-2.5 w-2.5 text-emerald-400" />}
                        {item.status === 'fail' && <AlertTriangle className="h-2.5 w-2.5 text-red-400" />}
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] mt-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(item.score / item.max) * 100}%`,
                            background: item.status === 'pass' ? '#18a871' : item.status === 'neutral' ? '#2f7cf6' : '#e65054',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
