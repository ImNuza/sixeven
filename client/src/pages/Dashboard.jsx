import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info, RefreshCw, ShieldCheck } from 'lucide-react'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import WellnessGauge from '../components/WellnessGauge'
import { fetchAssets, fetchPortfolioHistory, fetchPortfolioSummary, fetchPrices, refreshPrices } from '../services/api.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-4 py-3 text-sm">
      <p className="text-white/60 text-xs">{payload[0]?.payload?.name || payload[0]?.payload?.month}</p>
      <p className="text-white font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

const insightIcons = {
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  positive: <CheckCircle className="h-4 w-4 text-positive" />,
  info: <Info className="h-4 w-4 text-accent" />,
}

const insightBorders = {
  warning: 'border-warning/20',
  positive: 'border-positive/20',
  info: 'border-accent/20',
}

export default function Dashboard() {
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadDashboardData(showSpinner = true) {
      try {
        if (showSpinner) {
          setLoading(true)
        }
        setError('')

        const [assetsData, summaryData, historyData, priceData] = await Promise.all([
          fetchAssets(),
          fetchPortfolioSummary(),
          fetchPortfolioHistory(),
          fetchPrices(),
        ])

        if (cancelled) {
          return
        }

        setAssets(assetsData)
        setSummary(summaryData)
        setHistory(historyData)
        setPrices(priceData)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load dashboard data.')
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLoading(false)
        }
      }
    }

    loadDashboardData()
    const intervalId = window.setInterval(() => {
      loadDashboardData(false)
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const totalNetWorth = summary?.totalNetWorth ?? 0
  const totalCost = summary?.totalCost ?? 0
  const totalGainLoss = summary?.totalGainLoss ?? 0
  const gainLossPercent = totalCost > 0 ? (summary?.gainLossPct ?? 0).toFixed(1) : '0.0'
  const { score, breakdown } = useMemo(() => calculateWellnessScore(assets), [assets])
  const healthStatus = useMemo(() => getWellnessStatus(score), [score])
  const insights = useMemo(() => buildPortfolioInsights(assets, summary, prices), [assets, prices, summary])

  const pieData = useMemo(() => {
    const grouped = {}
    assets.forEach((asset) => {
      grouped[asset.category] = (grouped[asset.category] || 0) + asset.value
    })
    return Object.entries(grouped).map(([key, value]) => ({
      name: ASSET_CATEGORIES[key],
      value,
      key,
    }))
  }, [assets])

  const monthlyChange = summary?.monthlyChange ?? 0
  const monthlyChangePercent = summary ? summary.monthlyChangePct.toFixed(1) : '0.0'
  const latestPriceTime = prices[0]?.updated_at
    ? new Date(prices[0].updated_at).toLocaleString('en-SG')
    : 'No live price refresh yet'

  async function reloadAll() {
    const [assetsData, summaryData, historyData, priceData] = await Promise.all([
      fetchAssets(),
      fetchPortfolioSummary(),
      fetchPortfolioHistory(),
      fetchPrices(),
    ])
    setAssets(assetsData)
    setSummary(summaryData)
    setHistory(historyData)
    setPrices(priceData)
  }

  async function handleManualRefresh() {
    try {
      setIsRefreshing(true)
      setError('')
      await refreshPrices()
      await reloadAll()
    } catch (err) {
      setError(err.message || 'Failed to refresh live prices.')
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="glass-card p-6">
          <p className="text-sm text-white/70">Loading live portfolio data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="glass-card border border-red-500/20 p-6">
          <h1 className="text-xl font-bold text-white">Dashboard unavailable</h1>
          <p className="mt-2 text-sm text-white/60">{error}</p>
          <p className="mt-3 text-xs text-white/40">
            Check that the API server is running on port 3001 and PostgreSQL is available.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="app-kicker">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Wealth Dashboard</h1>
          <p className="mt-2 text-sm text-white/40">A single health check on your portfolio, liquidity, and risk posture.</p>
          <p className="mt-3 text-xs text-white/30">Latest market sync: {latestPriceTime}</p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="app-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
        </button>
      </div>

      <div className="grid grid-cols-[1.45fr_0.9fr] gap-6">
        <div className="glass-card glow-blue p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="app-kicker">Net worth</p>
              <h2 className="gradient-text mt-4 text-5xl font-semibold tracking-tight">
                {formatCurrency(totalNetWorth)}
              </h2>
              <div className="mt-5 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  {monthlyChange >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-positive" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-negative" />
                  )}
                  <span className={`text-sm font-semibold ${monthlyChange >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {monthlyChange >= 0 ? '+' : ''}{formatCurrency(monthlyChange)} ({monthlyChangePercent}%)
                  </span>
                  <span className="text-xs text-white/30">this month</span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${totalGainLoss >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)} ({gainLossPercent}%)
                  </span>
                  <span className="text-xs text-white/30">total P&amp;L</span>
                </div>
              </div>
            </div>

            <div
              className="min-w-[220px] rounded-[28px] border px-5 py-5"
              style={{
                borderColor: `${healthStatus.color}33`,
                backgroundColor: `${healthStatus.color}10`,
              }}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" style={{ color: healthStatus.color }} />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: healthStatus.color }}>
                  Financial Health
                </span>
              </div>
              <div className="mt-5 flex items-end gap-3">
                <span className="text-5xl font-semibold" style={{ color: healthStatus.color }}>{score}</span>
                <span className="pb-2 text-sm text-white/45">/100</span>
              </div>
              <div className="app-health-badge mt-3" style={{ color: healthStatus.color, backgroundColor: `${healthStatus.color}14` }}>
                {healthStatus.label}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{healthStatus.summary}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <p className="app-kicker">Score dial</p>
          <div className="mt-5 flex flex-col items-center justify-center">
            <WellnessGauge score={score} />
            <p className="mt-4 text-center text-sm text-white/50">
              Investors can use this score as a quick read on diversification, liquidity, and emergency readiness.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Financial Health" value={`${score}/100`} detail={healthStatus.label} tone={healthStatus.color} />
        <MetricCard label="Net Worth" value={formatCurrency(totalNetWorth)} detail="Current balance sheet" />
        <MetricCard
          label="Monthly Move"
          value={`${monthlyChange >= 0 ? '+' : ''}${formatCurrency(monthlyChange)}`}
          detail={`${monthlyChangePercent}% vs prior month`}
          tone={monthlyChange >= 0 ? '#18a871' : '#e65054'}
        />
        <MetricCard
          label="Total P&L"
          value={`${totalGainLoss >= 0 ? '+' : ''}${formatCurrency(totalGainLoss)}`}
          detail={`${gainLossPercent}% overall`}
          tone={totalGainLoss >= 0 ? '#18a871' : '#e65054'}
        />
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-2 glass-card p-6">
          <p className="app-kicker">Allocation</p>
          <p className="mt-2 text-lg font-semibold text-white">Asset Allocation</p>
          <p className="mt-1 text-sm text-white/40">A quick view of concentration risk across categories.</p>
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {pieData.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[entry.key] }} />
                <span className="truncate text-white/50">{entry.name}</span>
                <span className="ml-auto font-medium text-white/80">
                  {totalNetWorth > 0 ? ((entry.value / totalNetWorth) * 100).toFixed(0) : '0'}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-3 glass-card p-6">
          <p className="app-kicker">Trajectory</p>
          <p className="mt-2 text-lg font-semibold text-white">Net Worth Over Time</p>
          <p className="mt-1 text-sm text-white/40">Snapshot history makes progress and reversals easy to spot.</p>
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                  domain={['dataMin - 10000', 'dataMax + 10000']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  fill="url(#netWorthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <p className="app-kicker">Breakdown</p>
          <p className="mt-2 text-lg font-semibold text-white">Wellness Score Breakdown</p>
          <p className="mt-1 text-sm text-white/40">The four components behind the headline health number.</p>
          <div className="mt-5 space-y-4">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm text-white/70">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{item.detail}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.status === 'pass'
                        ? 'bg-positive/10 text-positive'
                        : 'bg-negative/10 text-negative'
                    }`}>
                      {item.score}/{item.max}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(item.score / item.max) * 100}%`,
                      backgroundColor: item.status === 'pass' ? '#10B981' : '#EF4444',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <p className="app-kicker">Signals</p>
          <p className="mt-2 text-lg font-semibold text-white">Quick Insights</p>
          <p className="mt-1 text-sm text-white/40">The clearest risks and strengths in the current portfolio.</p>
          <div className="mt-5 space-y-3">
            {insights.highlights.slice(0, 4).map((insight) => (
              <div key={insight.title} className={`flex gap-3 rounded-xl border bg-white/[0.02] p-3 ${insightBorders[insight.type]}`}>
                <div className="mt-0.5 flex-shrink-0">{insightIcons[insight.type]}</div>
                <div>
                  <p className="text-sm font-medium text-white/80">{insight.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/40">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, detail, tone = 'var(--app-text)' }) {
  return (
    <div className="glass-card p-5">
      <p className="app-kicker">{label}</p>
      <p className="mt-3 text-2xl font-semibold" style={{ color: tone }}>{value}</p>
      <p className="mt-2 text-sm text-white/45">{detail}</p>
    </div>
  )
}
