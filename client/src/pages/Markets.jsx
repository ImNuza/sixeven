import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Search, RefreshCw, Star, StarOff,
  Globe, Bitcoin, BarChart2, ChevronUp, ChevronDown, Activity,
  ArrowUpRight, ArrowDownRight, Clock, Zap, Briefcase,
} from 'lucide-react'
import { fetchAssets, fetchPrices, refreshPrices } from '../services/api.js'

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

const RANGE_OPTIONS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y']

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
}
function fmtCompact(n) {
  if (!n) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  return `$${fmt(n, 0)}`
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
function fmtDate(ts, range) {
  const d = new Date(ts)
  if (range === '1d' || range === '5d') {
    return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })
}

// ── Change badge ──────────────────────────────────────────────────────────────
function ChangeBadge({ pct, small }) {
  const up = pct >= 0
  const cls = small ? 'text-[11px] font-semibold' : 'text-sm font-bold'
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
      {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  )
}

// ── Top ticker tape ───────────────────────────────────────────────────────────
function TickerTape({ indices }) {
  const ref = useRef(null)
  return (
    <div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--app-border)', background: 'rgba(0,0,0,0.18)', height: 36 }}>
      <div ref={ref} className="flex gap-8 items-center h-full px-4 overflow-x-auto scrollbar-none whitespace-nowrap">
        {indices.map(idx => (
          <span key={idx.ticker} className="flex items-center gap-2 text-xs shrink-0">
            <span style={{ color: 'var(--app-text-muted)' }}>{idx.label}</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--app-text)' }}>
              {idx.price ? fmt(idx.price, idx.price > 100 ? 2 : 4) : '—'}
            </span>
            <ChangeBadge pct={idx.changePct || 0} small />
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, range }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-xl" style={{ background: 'var(--app-surface-strong)', borderColor: 'var(--app-border)', minWidth: 130 }}>
      <p style={{ color: 'var(--app-text-muted)' }} className="mb-1">{fmtDate(d.t, range)}</p>
      <p className="font-mono font-bold text-sm" style={{ color: 'var(--app-text)' }}>{fmt(d.c, 2)}</p>
      {d.o != null && (
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5" style={{ color: 'var(--app-text-muted)' }}>
          <span>O: <span className="font-mono" style={{ color: 'var(--app-text-soft)' }}>{fmt(d.o, 2)}</span></span>
          <span>H: <span className="font-mono text-emerald-400">{fmt(d.h, 2)}</span></span>
          <span>L: <span className="font-mono text-red-400">{fmt(d.l, 2)}</span></span>
          <span>V: <span className="font-mono" style={{ color: 'var(--app-text-soft)' }}>{d.v ? fmtCompact(d.v) : '—'}</span></span>
        </div>
      )}
    </div>
  )
}

// ── Price chart ───────────────────────────────────────────────────────────────
function PriceChart({ ticker, range, onRangeChange }) {
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    apiFetch(`/api/markets/chart/${encodeURIComponent(ticker)}?range=${range}`)
      .then(d => setCandles(d.candles || []))
      .catch(() => setCandles([]))
      .finally(() => setLoading(false))
  }, [ticker, range])

  const first = candles[0]?.c || 0
  const last = candles[candles.length - 1]?.c || 0
  const isUp = last >= first
  const color = isUp ? '#18a871' : '#e65054'
  const minY = candles.length ? Math.min(...candles.map(c => c.c)) * 0.999 : 0
  const maxY = candles.length ? Math.max(...candles.map(c => c.c)) * 1.001 : 0

  return (
    <div className="relative" style={{ height: 320 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
        </div>
      )}
      <div className="flex gap-1.5 mb-3">
        {RANGE_OPTIONS.map(r => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: range === r ? 'var(--app-accent)' : 'var(--app-surface)',
              color: range === r ? '#000' : 'var(--app-text-muted)',
            }}
          >{r.toUpperCase()}</button>
        ))}
      </div>
      {candles.length > 0 ? (
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart data={candles} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.22} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={ts => fmtDate(ts, range)}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.28)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[minY, maxY]}
              tickFormatter={v => fmt(v, v > 1000 ? 0 : 2)}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.28)' }}
              tickLine={false}
              axisLine={false}
              width={64}
              orientation="right"
            />
            <Tooltip content={<ChartTooltip range={range} />} />
            <ReferenceLine y={first} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="c"
              stroke={color}
              strokeWidth={2}
              fill="url(#chartGrad)"
              dot={false}
              activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : !loading && (
        <div className="flex h-64 items-center justify-center text-xs" style={{ color: 'var(--app-text-muted)' }}>
          No chart data available
        </div>
      )}
    </div>
  )
}

// ── Symbol row in watchlist ───────────────────────────────────────────────────
function SymbolRow({ item, isSelected, onSelect, starred, onToggleStar }) {
  const up = (item.changePct || 0) >= 0
  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all text-left"
      style={{
        background: isSelected ? 'var(--app-surface-strong)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--app-accent)' : '2px solid transparent',
      }}
    >
      <button
        className="shrink-0 p-0.5 rounded transition-colors"
        onClick={e => { e.stopPropagation(); onToggleStar(item.ticker) }}
        style={{ color: starred ? '#C9A84C' : 'var(--app-text-muted)' }}
      >
        {starred ? <Star className="h-3 w-3 fill-current" /> : <StarOff className="h-3 w-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate" style={{ color: 'var(--app-text)' }}>{item.ticker}</p>
        <p className="text-[10px] truncate" style={{ color: 'var(--app-text-muted)' }}>{item.label}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-mono font-semibold" style={{ color: 'var(--app-text)' }}>
          {item.price ? fmt(item.price, item.price > 100 ? 2 : 4) : '—'}
        </p>
        <ChangeBadge pct={item.changePct || 0} small />
      </div>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Markets() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [tab, setTab] = useState('indices')    // indices | stocks | crypto
  const [selected, setSelected] = useState(null)
  const [range, setRange] = useState('1mo')
  const [search, setSearch] = useState('')
  const [starred, setStarred] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mkt_starred') || '[]')) } catch { return new Set() }
  })
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [assets, setAssets] = useState([])
  const [priceCache, setPriceCache] = useState([])

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiFetch('/api/markets/overview')
      setOverview(data)
      // Auto-select first index on initial load
      if (!selected && data.indices?.length) {
        const first = data.indices[0]
        setSelected({ ...first, type: 'index' })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selected])

  useEffect(() => { loadOverview() }, [])

  const loadPositions = useCallback(async () => {
    try {
      const [assetData, priceData] = await Promise.all([fetchAssets(), fetchPrices()])
      setAssets(assetData)
      setPriceCache(Array.isArray(priceData) ? priceData : [])
    } catch (e) {
      console.error(e)
    } finally {
      setPositionsLoading(false)
    }
  }, [])

  useEffect(() => { loadPositions() }, [loadPositions])

  // Load quote for selected symbol
  useEffect(() => {
    if (!selected) return
    setQuoteLoading(true)
    apiFetch(`/api/markets/quote/${encodeURIComponent(selected.ticker)}`)
      .then(setQuote)
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false))
  }, [selected?.ticker])

  function refresh() {
    setRefreshing(true)
    Promise.all([
      loadOverview(),
      refreshPrices().catch(() => null).then(() => loadPositions()),
    ]).finally(() => setRefreshing(false))
  }

  function toggleStar(ticker) {
    setStarred(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      localStorage.setItem('mkt_starred', JSON.stringify([...next]))
      return next
    })
  }

  function handleSelect(item, type) {
    setSelected({ ...item, type })
    setRange('1mo')
  }

  const allItems = {
    indices: (overview?.indices || []).map(x => ({ ...x, type: 'index' })),
    stocks:  (overview?.stocks  || []).map(x => ({ ...x, type: 'stock' })),
    crypto:  (overview?.crypto  || []).map(x => ({ ...x, type: 'crypto' })),
  }

  const tabItems = allItems[tab].filter(it =>
    !search || it.label.toLowerCase().includes(search.toLowerCase()) || it.ticker.toLowerCase().includes(search.toLowerCase())
  )

  const displayQuote = quote && !quoteLoading ? quote : selected
  const changeUp = (displayQuote?.changePct || 0) >= 0
  const livePriceMap = useMemo(() => {
    const mapped = new Map()
    for (const item of priceCache) {
      if (item?.symbol) mapped.set(String(item.symbol).toUpperCase(), Number(item.price || 0))
    }
    return mapped
  }, [priceCache])
  const portfolioPositions = useMemo(() => {
    return assets
      .filter((asset) => ['STOCKS', 'CRYPTO'].includes(asset.category))
      .map((asset) => {
        const livePrice = asset.ticker ? livePriceMap.get(String(asset.ticker).toUpperCase()) : null
        const quantity = Number(asset.quantity || 0)
        const marketValue = livePrice && quantity > 0 ? livePrice * quantity : Number(asset.value || 0)
        const costBasis = Number(asset.cost || 0)
        const pnl = marketValue - costBasis
        const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0

        return {
          ...asset,
          livePrice,
          marketValue,
          pnl,
          pnlPct,
        }
      })
      .sort((a, b) => b.marketValue - a.marketValue)
  }, [assets, livePriceMap])
  const trackedValue = portfolioPositions.reduce((sum, item) => sum + item.marketValue, 0)

  // Build indices sorted for comparison bar
  const indicesSorted = [...(overview?.indices || [])].sort((a, b) => (b.changePct || 0) - (a.changePct || 0))
  const maxAbsPct = Math.max(...indicesSorted.map(i => Math.abs(i.changePct || 0)), 0.01)

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ background: 'var(--app-bg)', margin: '-1.5rem -2rem', height: 'calc(100vh - 0px)', minHeight: '100vh' }}
    >

      {/* ── Ticker tape ── */}
      {overview && <TickerTape indices={overview.indices} />}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: watchlist ── */}
        <aside className="flex flex-col border-r shrink-0" style={{ width: 240, borderColor: 'var(--app-border)' }}>
          {/* Search */}
          <div className="p-3 border-b" style={{ borderColor: 'var(--app-border)' }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--app-text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search symbol…"
                className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--app-text)', outline: 'none' }}
              />
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b" style={{ borderColor: 'var(--app-border)' }}>
            {[
              { key: 'indices', icon: Globe,     label: 'Indices' },
              { key: 'stocks',  icon: TrendingUp, label: 'Stocks'  },
              { key: 'crypto',  icon: Bitcoin,    label: 'Crypto'  },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-all"
                style={{
                  color: tab === key ? 'var(--app-accent)' : 'var(--app-text-muted)',
                  borderBottom: tab === key ? '2px solid var(--app-accent)' : '2px solid transparent',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Symbol list */}
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--app-surface)' }} />
              ))
            ) : tabItems.map(item => (
              <SymbolRow
                key={item.ticker}
                item={item}
                isSelected={selected?.ticker === item.ticker}
                onSelect={it => handleSelect(it, item.type)}
                starred={starred.has(item.ticker)}
                onToggleStar={toggleStar}
              />
            ))}
          </div>

          {/* Refresh */}
          <div className="p-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{ background: 'var(--app-surface)', color: 'var(--app-text-muted)' }}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {overview?.updatedAt && (
              <p className="text-center text-[9px] mt-1" style={{ color: 'var(--app-text-muted)' }}>
                {new Date(overview.updatedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="p-5 space-y-5">

              {/* ── Symbol header ── */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-black" style={{ color: 'var(--app-text)' }}>{selected.ticker}</h1>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}>
                      {selected.type}
                    </span>
                    <button onClick={() => toggleStar(selected.ticker)} style={{ color: starred.has(selected.ticker) ? '#C9A84C' : 'var(--app-text-muted)' }}>
                      {starred.has(selected.ticker) ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{selected.label}</p>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-black font-mono" style={{ color: 'var(--app-text)' }}>
                    {displayQuote?.price ? fmt(displayQuote.price, displayQuote.price > 100 ? 2 : 4) : '—'}
                    <span className="text-sm font-normal ml-1.5" style={{ color: 'var(--app-text-muted)' }}>{displayQuote?.currency || 'USD'}</span>
                  </p>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <span className="text-base font-semibold" style={{ color: changeUp ? 'var(--app-success)' : 'var(--app-danger)' }}>
                      {changeUp ? '+' : ''}{fmt(displayQuote?.change || 0, 2)}
                    </span>
                    <span className="text-base font-semibold rounded-lg px-2 py-0.5" style={{ background: changeUp ? 'rgba(24,168,113,0.12)' : 'rgba(230,80,84,0.12)', color: changeUp ? 'var(--app-success)' : 'var(--app-danger)' }}>
                      {fmtPct(displayQuote?.changePct || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── KPI strip ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Market Cap', value: fmtCompact(displayQuote?.marketCap), icon: BarChart2 },
                  { label: 'Volume', value: fmtCompact(displayQuote?.volume), icon: Activity },
                  { label: 'Previous Close', value: fmt(displayQuote?.prev, 2), icon: Clock },
                  { label: 'Change', value: `${fmtPct(displayQuote?.changePct || 0)}`, icon: changeUp ? TrendingUp : TrendingDown, up: changeUp },
                ].map(({ label, value, icon: Icon, up }) => (
                  <div key={label} className="rounded-2xl p-3.5 border" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3.5 w-3.5" style={{ color: up === false ? 'var(--app-danger)' : up ? 'var(--app-success)' : 'var(--app-text-muted)' }} />
                      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--app-text-muted)' }}>{label}</span>
                    </div>
                    <p className="text-sm font-mono font-bold" style={{ color: up === false ? 'var(--app-danger)' : up ? 'var(--app-success)' : 'var(--app-text)' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border p-5" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                  <div>
                    <h2 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Your Live Stock & Crypto Positions</h2>
                    <p className="text-[11px]" style={{ color: 'var(--app-text-muted)' }}>
                      {portfolioPositions.length
                        ? `${portfolioPositions.length} tracked positions · ${fmtCompact(trackedValue)} combined value`
                        : 'No stock or crypto positions imported yet'}
                    </p>
                  </div>
                </div>

                {positionsLoading ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading your positions...
                  </div>
                ) : portfolioPositions.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ color: 'var(--app-text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                          {['Asset', 'Type', 'Qty', 'Live Price', 'Market Value', 'P&L', 'Return'].map((header) => (
                            <th key={header} className={`pb-2 font-semibold uppercase tracking-wide text-[10px] ${header === 'Asset' || header === 'Type' ? 'text-left' : 'text-right'}`}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {portfolioPositions.map((position, index) => {
                          const up = position.pnl >= 0
                          return (
                            <tr
                              key={position.id}
                              className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                              style={{ borderBottom: index < portfolioPositions.length - 1 ? '1px solid var(--app-border)' : 'none' }}
                              onClick={() => position.ticker && handleSelect({ ticker: position.ticker, label: position.name, price: position.livePrice || position.marketValue, type: position.category === 'CRYPTO' ? 'crypto' : 'stock' }, position.category === 'CRYPTO' ? 'crypto' : 'stock')}
                            >
                              <td className="py-2.5 font-semibold" style={{ color: 'var(--app-text)' }}>
                                {position.name}
                                {position.ticker ? <span className="ml-2 text-[10px]" style={{ color: 'var(--app-text-muted)' }}>{position.ticker}</span> : null}
                              </td>
                              <td className="py-2.5" style={{ color: 'var(--app-text-soft)' }}>{position.category}</td>
                              <td className="py-2.5 text-right font-mono" style={{ color: 'var(--app-text-soft)' }}>{position.quantity ? fmt(position.quantity, 4) : '—'}</td>
                              <td className="py-2.5 text-right font-mono" style={{ color: 'var(--app-text)' }}>
                                {position.livePrice ? `$${fmt(position.livePrice, position.livePrice > 1 ? 2 : 4)}` : 'Manual'}
                              </td>
                              <td className="py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--app-text)' }}>
                                ${fmt(position.marketValue, 2)}
                              </td>
                              <td className="py-2.5 text-right font-mono" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                                {up ? '+' : ''}${fmt(position.pnl, 2)}
                              </td>
                              <td className="py-2.5 text-right font-semibold" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                                {fmtPct(position.pnlPct)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    Add manual holdings, connect moomoo, or save crypto wallets during onboarding to populate this section.
                  </p>
                )}
              </div>

              {/* ── Price chart ── */}
              <div className="rounded-2xl border p-5" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Price Chart</h2>
                </div>
                <PriceChart ticker={selected.ticker} range={range} onRangeChange={setRange} />
              </div>

              {/* ── Global market comparison ── */}
              <div className="rounded-2xl border p-5" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Global Market Performance</h2>
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--app-text-muted)' }}>24h change</span>
                </div>
                <div className="space-y-3">
                  {indicesSorted.map(idx => {
                    const pct = idx.changePct || 0
                    const up = pct >= 0
                    const barW = Math.min(Math.abs(pct) / maxAbsPct * 100, 100)
                    return (
                      <div key={idx.ticker}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleSelect(idx, 'index')} className="text-xs font-semibold hover:underline" style={{ color: selected?.ticker === idx.ticker ? 'var(--app-accent)' : 'var(--app-text)' }}>
                              {idx.label}
                            </button>
                            <span className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>{idx.region}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono" style={{ color: 'var(--app-text-soft)' }}>{idx.price ? fmt(idx.price, idx.price > 1000 ? 0 : 2) : '—'}</span>
                            <span className="text-xs font-bold w-16 text-right" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                              {fmtPct(pct)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Centered bar chart: left side = negative, right = positive */}
                          <div className="flex-1 flex items-center" style={{ height: 6 }}>
                            <div className="flex-1 flex items-center justify-center" style={{ height: 6, position: 'relative' }}>
                              <div className="absolute inset-0 rounded-full" style={{ background: 'var(--app-border)' }} />
                              <div
                                className="absolute rounded-full transition-all duration-700"
                                style={{
                                  height: 6,
                                  width: `${barW / 2}%`,
                                  background: up ? 'var(--app-success)' : 'var(--app-danger)',
                                  left: up ? '50%' : `${50 - barW / 2}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Crypto market overview ── */}
              {tab !== 'indices' && overview?.crypto?.length > 0 && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Bitcoin className="h-4 w-4" style={{ color: '#F7931A' }} />
                    <h2 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Crypto Market</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {overview.crypto.map(c => {
                      const up = (c.changePct || 0) >= 0
                      return (
                        <button
                          key={c.ticker}
                          onClick={() => handleSelect({ ...c, ticker: c.coinId ? `${c.ticker}-USD` : c.ticker }, 'crypto')}
                          className="rounded-xl border p-3 text-left transition-all hover:border-accent"
                          style={{
                            background: selected?.ticker === c.ticker ? 'var(--app-surface-strong)' : 'var(--app-bg)',
                            borderColor: selected?.ticker === c.ticker ? 'var(--app-accent)' : 'var(--app-border)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>{c.ticker}</span>
                            {up ? <ArrowUpRight className="h-3 w-3 text-emerald-400" /> : <ArrowDownRight className="h-3 w-3 text-red-400" />}
                          </div>
                          <p className="text-sm font-mono font-bold" style={{ color: 'var(--app-text)' }}>
                            ${c.price >= 1 ? fmt(c.price, 2) : fmt(c.price, 4)}
                          </p>
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                            {fmtPct(c.changePct)}
                          </p>
                          {c.marketCap && (
                            <p className="text-[9px] mt-1" style={{ color: 'var(--app-text-muted)' }}>{fmtCompact(c.marketCap)}</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Top movers table ── */}
              <div className="rounded-2xl border p-5" style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>Stocks Watchlist</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--app-text-muted)', borderBottom: '1px solid var(--app-border)' }}>
                        {['Symbol', 'Name', 'Price', 'Change', '% Change', 'Volume', 'Mkt Cap'].map(h => (
                          <th key={h} className={`pb-2 font-semibold uppercase tracking-wide text-[10px] ${h === 'Symbol' || h === 'Name' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(overview?.stocks || []).map((s, i) => {
                        const up = (s.changePct || 0) >= 0
                        return (
                          <tr
                            key={s.ticker}
                            onClick={() => handleSelect(s, 'stock')}
                            className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                            style={{ borderBottom: i < (overview?.stocks?.length ?? 0) - 1 ? '1px solid var(--app-border)' : 'none' }}
                          >
                            <td className="py-2.5 font-bold" style={{ color: selected?.ticker === s.ticker ? 'var(--app-accent)' : 'var(--app-text)' }}>{s.ticker}</td>
                            <td className="py-2.5" style={{ color: 'var(--app-text-soft)' }}>{s.label}</td>
                            <td className="py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--app-text)' }}>{s.price ? fmt(s.price, 2) : '—'}</td>
                            <td className="py-2.5 text-right font-mono" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                              {s.change ? `${up ? '+' : ''}${fmt(s.change, 2)}` : '—'}
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="inline-flex items-center justify-end gap-0.5 font-bold" style={{ color: up ? 'var(--app-success)' : 'var(--app-danger)' }}>
                                {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {Math.abs(s.changePct || 0).toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono" style={{ color: 'var(--app-text-muted)' }}>{s.volume ? fmtCompact(s.volume) : '—'}</td>
                            <td className="py-2.5 text-right font-mono" style={{ color: 'var(--app-text-muted)' }}>{fmtCompact(s.marketCap)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center flex-col gap-3">
              <Globe className="h-10 w-10" style={{ color: 'var(--app-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Select a symbol from the watchlist</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
