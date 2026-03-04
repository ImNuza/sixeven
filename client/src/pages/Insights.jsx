import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Info, RefreshCw, TrendingUp } from 'lucide-react'
import { fetchInsights, refreshPrices } from '../services/api.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatMetricValue(metric) {
  if (metric.format === 'currency') {
    return formatCurrency(metric.value)
  }

  if (metric.format === 'percent') {
    return `${Number(metric.value || 0).toFixed(1)}%`
  }

  return String(metric.value ?? 0)
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [summary, setSummary] = useState(null)
  const [insights, setInsights] = useState({
    metrics: [],
    categoryAnalytics: [],
    highlights: [],
    assetMoves: [],
    priceStatus: 'No live price data available yet.',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [focus, setFocus] = useState(searchParams.get('focus') || 'ALL')
  const [highlightType, setHighlightType] = useState(searchParams.get('highlight') || 'ALL')
  const [moveSort, setMoveSort] = useState(searchParams.get('moveSort') || 'impact')
  const [moveDirection, setMoveDirection] = useState(searchParams.get('moveDirection') || 'desc')
  const [movePage, setMovePage] = useState(Number.parseInt(searchParams.get('movePage') || '1', 10) || 1)
  const [movePagination, setMovePagination] = useState({
    page: 1,
    pageSize: 5,
    total: 0,
    totalPages: 1,
  })

  useEffect(() => {
    const nextParams = {}
    if (focus !== 'ALL') nextParams.focus = focus
    if (highlightType !== 'ALL') nextParams.highlight = highlightType
    if (moveSort !== 'impact') nextParams.moveSort = moveSort
    if (moveDirection !== 'desc') nextParams.moveDirection = moveDirection
    if (movePage > 1) nextParams.movePage = String(movePage)
    setSearchParams(nextParams, { replace: true })
  }, [focus, highlightType, moveSort, moveDirection, movePage, setSearchParams])

  useEffect(() => {
    setMovePage(1)
  }, [focus, highlightType, moveSort, moveDirection])

  useEffect(() => {
    let cancelled = false

    async function loadInsights(showSpinner = true) {
      try {
        if (showSpinner) {
          setLoading(true)
        }
        setError('')
        const payload = await fetchInsights({
          focus,
          highlight: highlightType,
          moveSort,
          moveDirection,
          movePage,
          movePageSize: movePagination.pageSize,
        })
        if (cancelled) {
          return
        }
        setSummary(payload.summary)
        setInsights({
          metrics: payload.metrics || [],
          categoryAnalytics: payload.categoryAnalytics || [],
          highlights: payload.highlights || [],
          assetMoves: payload.assetMoves || [],
          priceStatus: payload.priceStatus || 'No live price data available yet.',
        })
        setMovePagination(payload.movePagination || {
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load insights.')
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLoading(false)
        }
      }
    }

    loadInsights()
    const intervalId = window.setInterval(() => {
      loadInsights(false)
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [focus, highlightType, moveSort, moveDirection, movePage, movePagination.pageSize])

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      await refreshPrices()
      const payload = await fetchInsights({
        focus,
        highlight: highlightType,
        moveSort,
        moveDirection,
        movePage,
        movePageSize: movePagination.pageSize,
      })
      setSummary(payload.summary)
      setInsights({
        metrics: payload.metrics || [],
        categoryAnalytics: payload.categoryAnalytics || [],
        highlights: payload.highlights || [],
        assetMoves: payload.assetMoves || [],
        priceStatus: payload.priceStatus || 'No live price data available yet.',
      })
      setMovePagination(payload.movePagination || movePagination)
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

      <div className="glass-card p-4">
        <div className="grid grid-cols-4 gap-4">
          <select
            aria-label="Focus category"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="ALL">All Analytics</option>
            <option value="CPF">CPF</option>
            <option value="PROPERTY">Property</option>
            <option value="BONDS">Bonds</option>
          </select>

          <select
            aria-label="Highlight type"
            value={highlightType}
            onChange={(event) => setHighlightType(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="ALL">All Highlight Types</option>
            <option value="warning">Warnings</option>
            <option value="positive">Positive</option>
            <option value="info">Info</option>
          </select>

          <select
            aria-label="Move sort"
            value={moveSort}
            onChange={(event) => setMoveSort(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="impact">Sort by Impact</option>
            <option value="gain">Sort by Gain</option>
            <option value="name">Sort by Name</option>
          </select>

          <select
            aria-label="Move direction"
            value={moveDirection}
            onChange={(event) => setMoveDirection(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
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

      <div className="grid grid-cols-3 gap-4">
        {insights.categoryAnalytics.map((card) => (
          <div key={card.key} className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">{card.title}</p>
                <p className={`mt-3 text-3xl font-bold ${card.accent}`}>{card.value}</p>
                <p className="mt-2 text-xs text-white/45">{card.subtitle}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {card.metrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between text-sm">
                  <span className="text-white/50">{metric.label}</span>
                  <span className="font-medium text-white/85">{formatMetricValue(metric)}</span>
                </div>
              ))}
            </div>
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
            {!insights.highlights.length ? (
              <p className="text-sm text-white/50">No highlights match the current filter.</p>
            ) : null}
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
          {!insights.assetMoves.length ? (
            <p className="col-span-5 text-sm text-white/50">No asset moves match the current focus filter.</p>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-between text-sm text-white/50">
          <span>
            Showing {movePagination.total === 0 ? 0 : (movePagination.page - 1) * movePagination.pageSize + 1}
            {' '}-{' '}
            {Math.min(movePagination.page * movePagination.pageSize, movePagination.total)} of {movePagination.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMovePage((current) => Math.max(1, current - 1))}
              disabled={movePagination.page === 1}
              className="app-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="px-2 text-xs uppercase tracking-[0.18em] text-white/35">
              Page {movePagination.page} / {movePagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setMovePage((current) => Math.min(movePagination.totalPages, current + 1))}
              disabled={movePagination.page === movePagination.totalPages}
              className="app-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
