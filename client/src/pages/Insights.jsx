import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Info, RefreshCw, TrendingUp } from 'lucide-react'
import { fetchAssets, fetchPortfolioSummary, fetchPrices, refreshPrices } from '../services/api.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

const iconMap = {
  warning: AlertTriangle,
  positive: CheckCircle,
  info: Info,
}

const iconClass = {
  warning: 'text-amber-300',
  positive: 'text-emerald-300',
  info: 'text-cyan-300',
}

export default function Insights() {
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function loadInsights() {
    try {
      setLoading(true)
      setError('')
      const [assetRows, summaryRow, priceRows] = await Promise.all([
        fetchAssets(),
        fetchPortfolioSummary(),
        fetchPrices(),
      ])
      setAssets(assetRows)
      setSummary(summaryRow)
      setPrices(priceRows)
    } catch (err) {
      setError(err.message || 'Failed to load insights.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInsights()
  }, [])

  const insights = useMemo(
    () => buildPortfolioInsights(assets, summary, prices),
    [assets, prices, summary]
  )

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      await refreshPrices()
      await loadInsights()
    } finally {
      setIsRefreshing(false)
    }
  }

  if (loading) {
    return <div className="glass-card p-6 text-sm text-white/70">Loading portfolio intelligence...</div>
  }

  if (error) {
    return (
      <div className="glass-card p-6">
        <h1 className="text-xl font-bold text-white">Insights unavailable</h1>
        <p className="mt-2 text-sm text-white/60">{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Insights</h1>
          <p className="mt-1 text-sm text-white/40">
            Live portfolio diagnostics based on your latest holdings and price data.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.07] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {insights.metrics.map((metric) => (
          <div key={metric.label} className="glass-card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">{metric.label}</p>
            <p className="mt-3 text-2xl font-bold text-white">{metric.value}</p>
            <p className="mt-2 text-xs text-white/45">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-white">Highlights</h2>
          </div>
          <div className="mt-5 space-y-3">
            {insights.highlights.map((item) => {
              const Icon = iconMap[item.type]
              return (
                <div key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${iconClass[item.type]}`} />
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/58">{item.message}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/40">Live Data Status</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{insights.priceStatus}</p>
          </div>

          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/40">Summary</h2>
            <p className="mt-3 text-2xl font-bold text-white">{formatCurrency(summary?.totalNetWorth)}</p>
            <p className="mt-2 text-sm text-white/50">
              Total gain/loss: {formatCurrency(summary?.totalGainLoss)} ({summary?.gainLossPct?.toFixed(1) || '0.0'}%)
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-base font-semibold text-white">Largest Asset Moves</h2>
        <div className="mt-5 grid grid-cols-5 gap-4">
          {insights.assetMoves.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{item.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{item.category}</p>
              <p className={`mt-4 text-lg font-bold ${item.gain >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {item.gain >= 0 ? '+' : ''}{formatCurrency(item.gain)}
              </p>
              <p className="mt-1 text-xs text-white/45">{item.pct.toFixed(1)}% vs cost basis</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
