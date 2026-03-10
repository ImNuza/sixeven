import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle, RefreshCw, ShieldCheck,
  ArrowRight, TrendingUp, Banknote, Lock, AlertCircle,
} from 'lucide-react'
import { fetchAssets, fetchPortfolioSummary, refreshPrices } from '../services/api.js'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { useChat } from '../context/ChatContext.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { loadOnboardingProfile } from '../onboarding/storage.js'
import ScenarioSimulator from '../components/ScenarioSimulator.jsx'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency: 'SGD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value || 0)
}

const LIQUIDITY_CATS = new Set(['CASH', 'STOCKS', 'CRYPTO'])

const ACTION_MAP = {
  Diversification: {
    fail: 'Reduce your largest category below 40% of your total portfolio.',
    pass: 'Diversification is healthy — no changes needed.',
  },
  Liquidity: {
    fail: 'Move more assets into cash, stocks, or crypto to reach 20% liquid.',
    pass: 'Liquidity is on target — keep it above 20%.',
  },
  Volatility: {
    fail: 'Trim crypto + FOREX holdings to stay below the risk threshold.',
    pass: 'Volatility exposure is within the safe range.',
  },
  'Emergency Fund': {
    fail: 'Build your cash buffer — target enough months of living expenses based on your spending.',
    pass: 'Emergency fund meets the target.',
  },
  Concentration: {
    fail: 'Your largest single asset exceeds the limit — spread risk across more positions.',
    pass: 'No single asset dominates the portfolio.',
  },
  'Growth Trend': {
    fail: 'Net worth is declining — review spending or rebalance underperforming assets.',
    pass: 'Portfolio is growing on a monthly basis.',
    neutral: 'Not enough history yet to assess growth trend.',
  },
  'Income Assets': {
    fail: 'Consider adding bonds, CPF top-ups, or dividend stocks for passive income.',
    pass: 'Good allocation to income-generating assets.',
  },
  'Debt Health': {
    fail: 'Debt ratio is high — prioritise paying down liabilities before taking on more.',
    pass: 'Debt is at a manageable level relative to assets.',
  },
  Rebalancing: {
    fail: 'Allocation has drifted from targets — consider rebalancing now.',
    pass: 'Portfolio is well-aligned with target allocation.',
  },
  'Savings Rate': {
    fail: 'You\'re saving less than 20% of income — look for ways to reduce expenses or boost income.',
    pass: 'Healthy savings rate — keep building your wealth cushion.',
    neutral: 'Add your income and expenses in onboarding to unlock personalised savings insights.',
  },
}

const SEVERITY_ICONS = {
  URGENT: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  CAUTION: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
}

const LIQUIDITY_LABELS = {
  CASH: 'Liquid', STOCKS: 'Liquid', CRYPTO: 'Liquid',
  BONDS: 'Medium', FOREX: 'Liquid',
  PROPERTY: 'Illiquid', CPF: 'Illiquid', OTHER: 'Medium',
}

export default function Insights() {
  const { openChat, setPortfolioContext } = useChat()
  const { user } = useAuth()
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [onboardingProfile, setOnboardingProfile] = useState(() => loadOnboardingProfile(user?.id))

  useEffect(() => {
    setOnboardingProfile(loadOnboardingProfile(user?.id))
  }, [user?.id])

  useEffect(() => {
    function syncProfile() { setOnboardingProfile(loadOnboardingProfile(user?.id)) }
    window.addEventListener('safeseven:onboarding', syncProfile)
    return () => window.removeEventListener('safeseven:onboarding', syncProfile)
  }, [user?.id])

  useEffect(() => {
    let cancelled = false
    async function load(showSpinner = true) {
      try {
        if (showSpinner) setLoading(true)
        setError('')
        const [a, s] = await Promise.all([fetchAssets(), fetchPortfolioSummary()])
        if (cancelled) return
        setAssets(a)
        setSummary(s)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load insights.')
      } finally {
        if (!cancelled && showSpinner) setLoading(false)
      }
    }
    load()
    const id = window.setInterval(() => load(false), 60000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  const { score, breakdown } = useMemo(
    () => calculateWellnessScore(assets, { monthlyChangePct: summary?.monthlyChangePct ?? null, userProfile: onboardingProfile }),
    [assets, summary, onboardingProfile]
  )
  const healthStatus = useMemo(() => getWellnessStatus(score), [score])
  buildPortfolioInsights(assets, summary, [], onboardingProfile) // keep context alive

  const actions = useMemo(() => breakdown
    .map(item => ({
      ...item,
      action: item.goalHint || ACTION_MAP[item.label]?.[item.status] || '',
      deficit: item.max - item.score,
    }))
    .sort((a, b) => b.deficit - a.deficit),
  [breakdown])

  const fails = actions.filter(a => a.status === 'fail')
  const passes = actions.filter(a => a.status === 'pass' || a.status === 'neutral')

  // Wealth breakdown by category
  const wealthBreakdown = useMemo(() => {
    if (!assets.length) return []
    const total = assets.reduce((sum, a) => sum + a.value, 0)
    if (!total) return []
    const byCat = {}
    for (const a of assets) byCat[a.category] = (byCat[a.category] || 0) + a.value
    return Object.entries(byCat)
      .map(([cat, val]) => ({ cat, val, pct: (val / total) * 100 }))
      .sort((a, b) => b.val - a.val)
  }, [assets])

  const totalAssets = useMemo(() => assets.reduce((s, a) => s + a.value, 0), [assets])
  const liquidPct = useMemo(() => {
    if (!totalAssets) return 0
    const liq = assets.filter(a => LIQUIDITY_CATS.has(a.category)).reduce((s, a) => s + a.value, 0)
    return (liq / totalAssets) * 100
  }, [assets, totalAssets])

  // Key drivers — pick top 2 fails and top 1 pass for context
  const keyDrivers = useMemo(() => {
    const top2Fails = fails.slice(0, 2)
    const topPass = passes.slice(0, 1)
    return [...top2Fails, ...topPass].slice(0, 3)
  }, [fails, passes])

  useEffect(() => {
    if (!summary) return
    const lines = [
      `Financial Health Score: ${score}/100 (${healthStatus.label})`,
      `Net Worth: SGD ${summary.totalNetWorth?.toLocaleString() || 0}`,
      `Total Gain/Loss: SGD ${summary.totalGainLoss?.toLocaleString() || 0} (${summary.gainLossPct?.toFixed(1) || 0}%)`,
      `Failing factors: ${fails.map(f => `${f.label} (${f.score}/${f.max})`).join(', ') || 'none'}`,
      `Asset categories: ${[...new Set(assets.map(a => a.category))].join(', ')}`,
      `Total assets: ${assets.length}`,
    ]
    if (onboardingProfile) {
      if (onboardingProfile.financialGoals?.length) lines.push(`Financial goals: ${onboardingProfile.financialGoals.join(', ')}`)
      if (onboardingProfile.incomeRange) lines.push(`Income range: ${onboardingProfile.incomeRange}`)
      if (onboardingProfile.monthlyExpensesRange) lines.push(`Monthly expenses: ${onboardingProfile.monthlyExpensesRange}`)
      if (onboardingProfile.riskAppetite) lines.push(`Risk appetite: ${onboardingProfile.riskAppetite}`)
    }
    setPortfolioContext(lines.join('\n'))
  }, [score, healthStatus, summary, fails, assets, onboardingProfile, setPortfolioContext])

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      await refreshPrices()
      const [a, s] = await Promise.all([fetchAssets(), fetchPortfolioSummary()])
      setAssets(a); setSummary(s)
    } catch { /* silent */ } finally { setIsRefreshing(false) }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="glass-card p-8 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <p className="text-sm text-white/60">Analysing your portfolio…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="glass-card p-8 border border-red-500/20">
          <h2 className="text-white font-semibold">Insights unavailable</h2>
          <p className="mt-2 text-sm text-white/50">{error}</p>
        </div>
      </div>
    )
  }

  const zones = [
    { label: 'Fragile', min: 0,  max: 49,  color: '#e65054' },
    { label: 'Caution', min: 50, max: 69,  color: '#f0a100' },
    { label: 'Strong',  min: 70, max: 84,  color: '#2f7cf6' },
    { label: 'Excellent', min: 85, max: 100, color: '#18a871' },
  ]
  const markerPct = Math.min(100, Math.max(0, score))
  const gainLoss = summary?.totalGainLoss ?? 0
  const gainLossPct = summary?.gainLossPct?.toFixed(1) ?? '0.0'

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Portfolio Insights</h1>
          <p className="text-sm text-white/40 mt-1">Your financial wellness summary, key risks, and action plan.</p>
        </div>
        <button
          type="button" onClick={handleRefresh} disabled={isRefreshing}
          className="app-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Section 1: Financial Health Score ────────────────── */}
      <div className="glass-card p-6">
        {/* Score row */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="app-kicker mb-1">Financial Health Score</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-6xl font-bold leading-none" style={{ color: healthStatus.color }}>{score}</span>
              <span className="text-xl text-white/25 font-light">/100</span>
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold ml-1"
                style={{ color: healthStatus.color, borderColor: healthStatus.color + '50', background: healthStatus.color + '18' }}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {healthStatus.label}
              </div>
            </div>
            <p className="text-sm text-white/45 mt-2">{healthStatus.summary}</p>
          </div>
          <div className="text-right flex-shrink-0 ml-8">
            <p className="text-xs text-white/35 uppercase tracking-wider mb-1">Net Worth</p>
            <p className="text-3xl font-bold text-white">{formatCurrency(summary?.totalNetWorth)}</p>
            <p className={`text-sm mt-1 font-medium ${gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)} ({gainLoss >= 0 ? '+' : ''}{gainLossPct}%)
            </p>
          </div>
        </div>

        {/* Segmented health bar */}
        <div className="relative mb-5">
          <div className="flex gap-1 h-2.5 rounded-full overflow-hidden">
            {zones.map(z => (
              <div
                key={z.label}
                className="h-full rounded-sm transition-all"
                style={{
                  flex: z.max - z.min + 1,
                  backgroundColor: `${z.color}35`,
                  outline: score >= z.min && score <= z.max ? `1.5px solid ${z.color}` : 'none',
                  outlineOffset: '1px',
                }}
              />
            ))}
          </div>
          <div
            className="absolute top-0 h-2.5 w-0.5 rounded-full transition-all duration-700"
            style={{ left: `${markerPct}%`, backgroundColor: healthStatus.color, boxShadow: `0 0 6px ${healthStatus.color}` }}
          />
          <div className="flex gap-1 mt-1.5">
            {zones.map(z => (
              <div key={z.label} style={{ flex: z.max - z.min + 1 }}>
                <p className="text-[10px] font-medium" style={{ color: `${z.color}99` }}>{z.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Key Drivers */}
        {keyDrivers.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {keyDrivers.map(d => (
              <div
                key={d.label}
                className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl border ${
                  d.status === 'pass'
                    ? 'border-emerald-400/15 bg-emerald-400/[0.04]'
                    : 'border-red-400/15 bg-red-400/[0.04]'
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {d.status === 'pass'
                    ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/80">{d.label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{d.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 10-Factor compact grid */}
        <div className="pt-4 border-t border-white/[0.05] grid grid-cols-5 gap-x-5 gap-y-3">
          {breakdown.map(item => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-white/50">{item.label}</p>
                <span className="text-[11px] font-mono text-white/35">{item.score}/{item.max}</span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.06]">
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
      </div>

      {/* ── Sections 2 & 3: Issues + Actions ─────────────────── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Top Issues to Fix */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="app-kicker">Top Issues to Fix</p>
            {fails.length > 0 && (
              <span className="text-xs font-bold bg-red-400/10 text-red-400 px-2.5 py-0.5 rounded-full border border-red-400/20">
                {fails.length} issue{fails.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {fails.length === 0 ? (
            <div className="flex items-center gap-3 py-5 px-2">
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">All clear</p>
                <p className="text-xs text-white/40 mt-0.5">Every health factor is passing. Keep it up.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {fails.map(item => {
                const severity = item.deficit > 6 ? 'URGENT' : 'CAUTION'
                const borderCls = severity === 'URGENT'
                  ? 'border-red-400/20 bg-red-400/[0.04]'
                  : 'border-amber-400/15 bg-amber-400/[0.03]'
                const barColor = severity === 'URGENT' ? '#e65054' : '#f0a100'
                const pillCls = severity === 'URGENT'
                  ? 'bg-red-400/10 text-red-400 border-red-400/20'
                  : 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                return (
                  <div key={item.label} className={`p-3.5 rounded-xl border ${borderCls}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {SEVERITY_ICONS[severity]}
                        <p className="text-sm font-semibold text-white/85">{item.label}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${pillCls}`}>
                        {severity}
                      </span>
                    </div>
                    <p className="text-xs text-white/45">{item.detail}</p>
                    <div className="h-1 rounded-full bg-white/[0.06] mt-2">
                      <div className="h-full rounded-full" style={{ width: `${(item.score / item.max) * 100}%`, background: barColor }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recommended Actions */}
        <div className="glass-card p-6">
          <p className="app-kicker mb-4">Recommended Actions</p>

          {fails.length === 0 ? (
            <div className="flex items-center gap-3 py-5 px-2">
              <TrendingUp className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">Portfolio is healthy</p>
                <p className="text-xs text-white/40 mt-0.5">Focus on growing your wealth and rebalancing periodically.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {fails.slice(0, 5).map((item, i) => (
                <div key={item.label} className="flex gap-3">
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'var(--app-accent)', opacity: 0.85 }}
                  >
                    <span className="text-white">{i + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/80">{item.label}</p>
                    <div className="flex items-start gap-1 mt-0.5">
                      <ArrowRight className="h-3 w-3 text-white/30 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-white/45 leading-snug">{item.action}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {passes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-1.5">
              {passes.slice(0, 4).map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-emerald-400/70 flex-shrink-0" />
                  <p className="text-[11px] text-white/35">{item.label} — {item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Wealth Breakdown ──────────────────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="app-kicker">Wealth Breakdown</p>
          <div className="flex items-center gap-4 text-xs text-white/35">
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-blue-400" />
              <span>{liquidPct.toFixed(0)}% liquid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-white/30" />
              <span>{(100 - liquidPct).toFixed(0)}% illiquid</span>
            </div>
          </div>
        </div>

        {wealthBreakdown.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-6">No assets yet. Add assets to see your wealth breakdown.</p>
        ) : (
          <>
            <div className="space-y-3">
              {wealthBreakdown.map(({ cat, val, pct }) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: CATEGORY_COLORS[cat] || '#6B7280' }}
                      />
                      <span className="text-sm text-white/70">{ASSET_CATEGORIES[cat] || cat}</span>
                      <span className="text-[11px] text-white/30 px-1.5 py-0.5 rounded-md bg-white/[0.04]">
                        {LIQUIDITY_LABELS[cat] || 'Medium'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-white/70 tabular-nums">{formatCurrency(val)}</span>
                      <span className="text-xs text-white/35 ml-2 tabular-nums">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: CATEGORY_COLORS[cat] || '#6B7280' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {wealthBreakdown[0]?.pct > 50 && (
              <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/50 leading-relaxed">
                  <span className="text-amber-300 font-medium">{ASSET_CATEGORIES[wealthBreakdown[0].cat]}</span> makes up{' '}
                  {wealthBreakdown[0].pct.toFixed(0)}% of your portfolio. Consider diversifying to reduce concentration risk.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 5: Scenario Lab ──────────────────────────── */}
      <ScenarioSimulator assets={assets} userProfile={onboardingProfile} />

    </div>
  )
}
