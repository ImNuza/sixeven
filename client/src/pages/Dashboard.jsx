import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  AlertTriangle, CheckCircle,
  Info, RefreshCw, ShieldCheck, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import { fetchAssets, fetchPortfolioHistory, fetchPortfolioSummary, fetchPrices, refreshPrices } from '../services/api.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'

const TIME_RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'ALL', months: Infinity },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatChange(value) {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-4 py-3 text-sm">
      <p className="text-white/50 text-xs mb-1">{payload[0]?.payload?.name || payload[0]?.payload?.month}</p>
      <p className="text-white font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
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

export default function Dashboard() {
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeRange, setActiveRange] = useState('ALL')

  useEffect(() => {
    let cancelled = false

    async function load(showSpinner = true) {
      try {
        if (showSpinner) setLoading(true)
        setError('')
        const [a, s, h, p] = await Promise.all([
          fetchAssets(), fetchPortfolioSummary(), fetchPortfolioHistory(), fetchPrices(),
        ])
        if (cancelled) return
        setAssets(a); setSummary(s); setHistory(h); setPrices(p)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard data.')
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
  const insights = useMemo(() => buildPortfolioInsights(assets, summary, prices), [assets, prices, summary])

  const pieData = useMemo(() => {
    const grouped = {}
    assets.forEach((a) => { grouped[a.category] = (grouped[a.category] || 0) + a.value })
    return Object.entries(grouped)
      .map(([key, value]) => ({ name: ASSET_CATEGORIES[key], value, key }))
      .sort((a, b) => b.value - a.value)
  }, [assets])

  const filteredHistory = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.label === activeRange)
    if (!range || range.months === Infinity) return history
    return history.slice(-range.months)
  }, [history, activeRange])

  const topHoldings = useMemo(() => {
    return [...assets]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((a) => ({
        ...a,
        gain: a.value - a.cost,
        gainPct: a.cost > 0 ? ((a.value - a.cost) / a.cost) * 100 : 0,
      }))
  }, [assets])

  const totalNetWorth = summary?.totalNetWorth ?? 0
  const totalCost = summary?.totalCost ?? 0
  const totalGainLoss = summary?.totalGainLoss ?? 0
  const gainLossPct = totalCost > 0 ? (summary?.gainLossPct ?? 0).toFixed(1) : '0.0'
  const monthlyChange = summary?.monthlyChange ?? 0
  const monthlyChangePct = summary ? summary.monthlyChangePct.toFixed(1) : '0.0'
  const lastSync = prices[0]?.updated_at
    ? new Date(prices[0].updated_at).toLocaleString('en-SG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : null

  async function handleManualRefresh() {
    try {
      setIsRefreshing(true)
      setError('')
      await refreshPrices()
      const [a, s, h, p] = await Promise.all([fetchAssets(), fetchPortfolioSummary(), fetchPortfolioHistory(), fetchPrices()])
      setAssets(a); setSummary(s); setHistory(h); setPrices(p)
    } catch (err) {
      setError(err.message || 'Failed to refresh prices.')
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="glass-card p-8 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <p className="text-sm text-white/60">Loading portfolio data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="glass-card p-8 border border-red-500/20">
          <h2 className="text-white font-semibold">Dashboard unavailable</h2>
          <p className="mt-2 text-sm text-white/50">{error}</p>
          <p className="mt-3 text-xs text-white/30">Make sure the API server is running on port 3001 and PostgreSQL is available.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Wealth Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-3.5 w-3.5 text-white/30" />
            <p className="text-xs text-white/30">
              {lastSync ? `Last synced ${lastSync}` : 'Prices not yet synced'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="app-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing…' : 'Refresh Prices'}
        </button>
      </div>

      {/* ── Row 1: 4 KPI Cards ────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard
          label="Total Net Worth"
          value={formatCurrency(totalNetWorth)}
          valueClass="gradient-text text-3xl font-semibold tracking-tight"
          glow
        />
        <KpiCard
          label="This Month"
          value={formatChange(monthlyChange)}
          sub={`${monthlyChangePct}% vs last month`}
          positive={monthlyChange >= 0}
        />
        <KpiCard
          label="Total P&L"
          value={formatChange(totalGainLoss)}
          sub={`${gainLossPct}% on cost basis`}
          positive={totalGainLoss >= 0}
        />
        <KpiCard
          label="Wellness Score"
          value={`${score}/100`}
          sub={healthStatus.label}
          scoreColor={healthStatus.color}
          icon={<ShieldCheck className="h-4 w-4" style={{ color: healthStatus.color }} />}
        />
      </div>

      {/* ── Row 2: Trend Chart + Allocation ───────────────────── */}
      <div className="grid grid-cols-5 gap-5">

        {/* Net Worth Over Time */}
        <div className="col-span-3 glass-card p-6">
          <div className="flex items-start justify-between mb-4">
            <SectionHeader title="Net Worth Over Time" sub="Monthly snapshots" />
            <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 flex-shrink-0">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setActiveRange(r.label)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
                    activeRange === r.label
                      ? 'bg-white/10 text-white'
                      : 'text-white/35 hover:text-white/60'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={filteredHistory}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f7cf6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2f7cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
              <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 11 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                domain={['dataMin - 15000', 'dataMax + 15000']}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="value" stroke="#2f7cf6" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Asset Allocation */}
        <div className="col-span-2 glass-card p-6">
          <SectionHeader title="Asset Allocation" sub="Concentration by category" />
          <ResponsiveContainer width="100%" height={170} className="mt-3">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={48} outerRadius={78}
                paddingAngle={2} dataKey="value" stroke="none"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            {pieData.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.key] }} />
                <span className="text-xs text-white/50 flex-1 truncate">{entry.name}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-14 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${totalNetWorth > 0 ? (entry.value / totalNetWorth) * 100 : 0}%`,
                        backgroundColor: CATEGORY_COLORS[entry.key],
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-white/70 w-8 text-right">
                    {totalNetWorth > 0 ? ((entry.value / totalNetWorth) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Wellness + Insights ────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">

        {/* Wellness Score Breakdown */}
        <div className="glass-card p-6">
          <div className="flex items-start justify-between mb-5">
            <SectionHeader title="Wellness Breakdown" sub="The 4 factors behind your score" />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: healthStatus.color }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: healthStatus.color }}>
                {healthStatus.label}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white/75">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/35">{item.detail}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      item.status === 'pass'
                        ? 'bg-emerald-400/10 text-emerald-400'
                        : 'bg-red-400/10 text-red-400'
                    }`}>
                      {item.score}/{item.max}
                    </span>
                  </div>
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
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-sm text-white/50">Overall score</span>
            <span className="text-2xl font-semibold" style={{ color: healthStatus.color }}>{score}/100</span>
          </div>
        </div>

        {/* Quick Insights */}
        <div className="glass-card p-6">
          <SectionHeader title="Quick Insights" sub="Key risks and strengths" />
          <div className="mt-5 space-y-2">
            {insights.highlights.slice(0, 5).map((insight) => (
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
              <p className="text-sm text-white/30 py-4 text-center">No insights available yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Top Holdings Table ─────────────────────────── */}
      {topHoldings.length > 0 && (
        <div className="glass-card p-6">
          <SectionHeader title="Top Holdings" sub="Your 5 largest positions by value" />
          <div className="mt-5">
            <div className="grid grid-cols-5 gap-4 px-3 pb-2 border-b border-white/[0.06]">
              {['Asset', 'Category', 'Current Value', 'Gain / Loss', 'Return'].map((h) => (
                <p key={h} className="text-xs font-semibold text-white/30 uppercase tracking-wider">{h}</p>
              ))}
            </div>
            <div className="space-y-1 mt-1">
              {topHoldings.map((asset) => (
                <div
                  key={asset.id}
                  className="grid grid-cols-5 gap-4 items-center px-3 py-3 rounded-xl hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <p className="text-sm font-medium text-white/85 truncate">{asset.name}</p>
                  <span
                    className="text-xs px-2 py-1 rounded-lg w-fit"
                    style={{
                      backgroundColor: `${CATEGORY_COLORS[asset.category]}18`,
                      color: CATEGORY_COLORS[asset.category],
                    }}
                  >
                    {ASSET_CATEGORIES[asset.category] || asset.category}
                  </span>
                  <p className="text-sm font-semibold text-white/85">{formatCurrency(asset.value)}</p>
                  <div className="flex items-center gap-1.5">
                    {asset.gain >= 0
                      ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      : <ArrowDownRight className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                    }
                    <span className={`text-sm font-medium ${asset.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatChange(asset.gain)}
                    </span>
                  </div>
                  <span className={`text-sm font-medium ${asset.gainPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {asset.gainPct >= 0 ? '+' : ''}{asset.gainPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function SectionHeader({ title, sub }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white/85">{title}</h3>
      <p className="text-xs text-white/35 mt-0.5">{sub}</p>
    </div>
  )
}

function KpiCard({ label, value, sub, positive, valueClass, glow, scoreColor, icon }) {
  const isNeutral = positive === undefined && !scoreColor
  return (
    <div className={`glass-card p-5 ${glow ? 'glow-blue' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="app-kicker">{label}</p>
        {icon}
      </div>
      <p
        className={valueClass ?? `text-2xl font-semibold ${
          scoreColor ? '' : isNeutral ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400'
        }`}
        style={scoreColor ? { color: scoreColor } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p
          className="text-xs mt-1.5"
          style={scoreColor ? { color: `${scoreColor}99` } : undefined}
        >
          <span className={scoreColor ? 'font-semibold' : positive === false ? 'text-red-400/60' : 'text-white/35'}>
            {sub}
          </span>
        </p>
      )}
    </div>
  )
}
