import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Info, RefreshCw, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react'
import { fetchAssets, fetchPortfolioSummary, refreshPrices } from '../services/api.js'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'
import { useChat } from '../context/ChatContext.jsx'
import ScenarioSimulator from '../components/ScenarioSimulator.jsx'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

const insightIcons = {
  warning: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
  positive: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  info: <Info className="h-4 w-4 text-blue-400" />,
}

const insightBg = {
  warning: 'border-yellow-400/15 bg-yellow-400/[0.04]',
  positive: 'border-emerald-400/15 bg-emerald-400/[0.04]',
  info: 'border-blue-400/15 bg-blue-400/[0.04]',
}

const ACTION_MAP = {
  Diversification: {
    fail: 'Reduce your largest category below 40% of total portfolio.',
    pass: 'Diversification is healthy — no changes needed.',
  },
  Liquidity: {
    fail: 'Move more assets into cash, stocks, or crypto to reach 20% liquid.',
    pass: 'Liquidity is on target — keep it above 20%.',
  },
  'Crypto Exposure': {
    fail: 'Trim crypto holdings to stay below the 30% risk threshold.',
    pass: 'Crypto exposure is within the safe range.',
  },
  'Emergency Fund': {
    fail: 'Build your cash buffer — target 6 months of living expenses.',
    pass: 'Emergency fund meets the 6-month target.',
  },
}

export default function Insights() {
  const { openChat, setPortfolioContext } = useChat()
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

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

  const { score, breakdown } = useMemo(() => calculateWellnessScore(assets), [assets])
  const healthStatus = useMemo(() => getWellnessStatus(score), [score])
  const insights = useMemo(() => buildPortfolioInsights(assets, summary), [assets, summary])

  const actions = useMemo(() => {
    return breakdown
      .map((item) => ({
        ...item,
        action: ACTION_MAP[item.label]?.[item.status] ?? '',
        deficit: item.max - item.score,
      }))
      .sort((a, b) => b.deficit - a.deficit)
  }, [breakdown])

  const fails = actions.filter((a) => a.status === 'fail')
  const passes = actions.filter((a) => a.status === 'pass')

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
    setPortfolioContext(lines.join('\n'))
  }, [score, healthStatus, summary, fails, assets, setPortfolioContext])

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      await refreshPrices()
      const [a, s] = await Promise.all([fetchAssets(), fetchPortfolioSummary()])
      setAssets(a)
      setSummary(s)
    } catch {
      // silently skip refresh errors
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="glass-card p-8 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <p className="text-sm text-white/60">Analysing your portfolio...</p>
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

  // Segmented health bar zones
  const zones = [
    { label: 'Fragile', min: 0, max: 49, color: '#e65054' },
    { label: 'Caution', min: 50, max: 69, color: '#f0a100' },
    { label: 'Strong', min: 70, max: 84, color: '#2f7cf6' },
    { label: 'Excellent', min: 85, max: 100, color: '#18a871' },
  ]
  const markerPct = Math.min(100, Math.max(0, score))

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Portfolio Insights</h1>
          <p className="text-sm text-white/40 mt-1">Your financial health summary and priority actions.</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="app-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ── Financial Health Score ────────────────────────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="app-kicker mb-1">Financial Health Score</p>
            <div className="flex items-center gap-3">
              <span className="text-5xl font-semibold" style={{ color: healthStatus.color }}>{score}</span>
              <span className="text-lg text-white/30 font-light">/100</span>
              <div className="flex items-center gap-1.5 ml-2">
                <ShieldCheck className="h-4 w-4" style={{ color: healthStatus.color }} />
                <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: healthStatus.color }}>
                  {healthStatus.label}
                </span>
              </div>
            </div>
            <p className="text-sm text-white/45 mt-2">{healthStatus.summary}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/35 uppercase tracking-wider mb-1">Net Worth</p>
            <p className="text-2xl font-semibold text-white">{formatCurrency(summary?.totalNetWorth)}</p>
            <p className={`text-sm mt-1 font-medium ${(summary?.totalGainLoss ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {(summary?.totalGainLoss ?? 0) >= 0 ? '+' : ''}{formatCurrency(summary?.totalGainLoss)} ({summary?.gainLossPct?.toFixed(1) || '0.0'}%)
            </p>
          </div>
        </div>

        {/* Segmented bar */}
        <div className="relative">
          <div className="flex gap-1 h-3 rounded-full overflow-hidden">
            {zones.map((z) => (
              <div
                key={z.label}
                className="h-full rounded-sm"
                style={{
                  flex: z.max - z.min + 1,
                  backgroundColor: `${z.color}40`,
                  outline: score >= z.min && score <= z.max ? `1.5px solid ${z.color}` : 'none',
                  outlineOffset: '1px',
                }}
              />
            ))}
          </div>
          {/* Score marker */}
          <div
            className="absolute top-0 h-3 w-0.5 rounded-full transition-all duration-500"
            style={{ left: `${markerPct}%`, backgroundColor: healthStatus.color }}
          />
          {/* Zone labels */}
          <div className="flex gap-1 mt-2">
            {zones.map((z) => (
              <div key={z.label} style={{ flex: z.max - z.min + 1 }}>
                <p className="text-[10px] font-medium" style={{ color: `${z.color}99` }}>{z.label}</p>
                <p className="text-[10px] text-white/20">{z.min}–{z.max}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action Plan + Signals ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Action Plan */}
        <div className="glass-card p-6">
          <p className="app-kicker mb-4">Action Plan</p>
          {fails.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-400 font-medium">All factors are passing — your portfolio is healthy.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {fails.map((item, i) => (
                <div key={item.label} className="flex gap-3 p-3.5 rounded-xl border border-red-400/15 bg-red-400/[0.04]">
                  <span className="text-xs font-bold text-red-400/70 mt-0.5 flex-shrink-0 w-4">#{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-white/85">{item.label}</p>
                      <span className="text-xs font-semibold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
                        {item.score}/{item.max}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full bg-red-400/70 transition-all duration-500"
                        style={{ width: `${(item.score / item.max) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-start gap-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-red-400/70 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-white/50">{item.action}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {passes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2">
              {passes.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 px-1">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <p className="text-xs text-white/45">{item.label} — {item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key Signals */}
        <div className="glass-card p-6">
          <p className="app-kicker mb-4">Key Signals</p>
          <div className="space-y-2">
            {insights.highlights.map((insight) => (
              <div
                key={insight.title}
                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${insightBg[insight.type]}`}
              >
                <div className="mt-0.5 flex-shrink-0">{insightIcons[insight.type]}</div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/85 leading-tight">{insight.title}</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-snug">{insight.message}</p>
                </div>
              </div>
            ))}
            {insights.highlights.length === 0 && (
              <p className="text-sm text-white/30 py-4 text-center">No signals available yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Wellness Breakdown ────────────────────────────────── */}
      <div className="glass-card p-6">
        <p className="app-kicker mb-4">Wellness Breakdown</p>
        <div className="grid grid-cols-4 gap-4">
          {breakdown.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/70">{item.label}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  item.status === 'pass'
                    ? 'bg-emerald-400/10 text-emerald-400'
                    : 'bg-red-400/10 text-red-400'
                }`}>
                  {item.score}/{item.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(item.score / item.max) * 100}%`,
                    backgroundColor: item.status === 'pass' ? '#18a871' : '#e65054',
                  }}
                />
              </div>
              <p className="text-xs text-white/30">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── What-If Scenarios ────────────────────────────────── */}
      <ScenarioSimulator assets={assets} />

      {/* ── WealthAI ──────────────────────────────────────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-accent/10">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">Ask WealthAI</p>
              <p className="text-xs text-white/40">Get personalised advice based on your portfolio</p>
            </div>
          </div>
          <button
            onClick={() => openChat()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--app-accent)' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Open Chat
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Explain my health score', prompt: `My financial health score is ${score}/100 (${healthStatus.label}). Can you explain what this means and what I should focus on?` },
            { label: 'Fix my top issue', prompt: fails[0] ? `My top failing factor is "${fails[0].label}" (${fails[0].score}/${fails[0].max}). What steps should I take to fix this?` : 'What should I improve first to boost my wellness score?' },
            { label: 'Diversification tips', prompt: 'Based on my portfolio, how can I improve my diversification?' },
            { label: 'Build wealth faster', prompt: 'What are the most impactful steps I can take right now to grow my wealth more effectively?' },
          ].map(({ label, prompt }) => (
            <button
              key={label}
              onClick={() => openChat(prompt)}
              className="text-left text-xs px-3.5 py-3 rounded-xl border transition-all hover:border-accent/30 hover:bg-accent/[0.05]"
              style={{ color: 'var(--app-text-soft)', borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}
            >
              <span className="text-accent mr-1.5">→</span>{label}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
