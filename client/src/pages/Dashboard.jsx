import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  AlertTriangle, CheckCircle, Info, RefreshCw, ShieldCheck, Clock,
  ArrowUpRight, ArrowDownRight, Settings2, GripVertical, EyeOff, Eye, X,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { calculateWellnessScore, getWellnessStatus } from '../data/wellnessCalculator.js'
import { fetchAssets, fetchPortfolioHistory, fetchPortfolioSummary, fetchPrices, refreshPrices } from '../services/api.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'
import ExportMenu from '../components/ExportMenu'
import { exportDashboardPDF, exportDashboardExcel } from '../utils/exportReport'
import { useNotify } from '../context/NotificationContext'

const TIME_RANGES = [
  { label: '1M', months: 1 }, { label: '3M', months: 3 },
  { label: '6M', months: 6 }, { label: '1Y', months: 12 }, { label: 'ALL', months: Infinity },
]

const DEFAULT_WIDGETS = [
  { id: 'kpi',        label: 'Portfolio KPIs',   span: 'full' },
  { id: 'trend',      label: 'Net Worth Trend',  span: 'large' },
  { id: 'allocation', label: 'Asset Allocation', span: 'small' },
  { id: 'wellness',   label: 'Wellness Score',   span: 'half' },
  { id: 'insights',   label: 'Quick Insights',   span: 'half' },
  { id: 'holdings',   label: 'Top Holdings',     span: 'full' },
]

const STORAGE_KEY = 'dashboard_widgets_v1'

function loadWidgets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDGETS
    const saved = JSON.parse(raw)
    // merge saved order+visibility with default widget set
    const map = Object.fromEntries(saved.map(w => [w.id, w]))
    return DEFAULT_WIDGETS.map(d => ({ ...d, ...(map[d.id] || {}) }))
  } catch { return DEFAULT_WIDGETS }
}

function saveWidgets(widgets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets.map(({ id, visible }) => ({ id, visible }))))
}

function formatCurrency(v) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0 }).format(v)
}
function formatChange(v) { return `${v >= 0 ? '+' : ''}${formatCurrency(v)}` }

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-4 py-3 text-sm">
      <p className="text-xs mb-1" style={{ color: 'var(--app-text-muted)' }}>{payload[0]?.payload?.name || payload[0]?.payload?.month}</p>
      <p className="font-semibold" style={{ color: 'var(--app-text)' }}>{formatCurrency(payload[0].value)}</p>
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

// ── Sortable customize item ───────────────────────────────────
function SortableWidgetItem({ widget, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border px-3 py-3"
      {...attributes}
    >
      <button {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded" style={{ color: 'var(--app-text-muted)' }}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--app-text)' }}>{widget.label}</span>
      <button
        type="button"
        onClick={() => onToggle(widget.id)}
        className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
        style={{ color: widget.visible === false ? 'var(--app-text-muted)' : 'var(--app-accent)' }}
      >
        {widget.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Customize panel ───────────────────────────────────────────
function CustomizePanel({ widgets, onClose, onChange }) {
  const sensors = useSensors(useSensor(PointerSensor))
  const [local, setLocal] = useState(widgets)

  function handleDragEnd(event) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocal(prev => {
        const from = prev.findIndex(w => w.id === active.id)
        const to = prev.findIndex(w => w.id === over.id)
        return arrayMove(prev, from, to)
      })
    }
  }

  function handleToggle(id) {
    setLocal(prev => prev.map(w => w.id === id ? { ...w, visible: w.visible === false ? true : false } : w))
  }

  function handleApply() {
    onChange(local)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl"
        style={{ background: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>Customize Dashboard</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>Drag to reorder · toggle to show/hide</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-white/[0.06] transition-colors" style={{ color: 'var(--app-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={local.map(w => w.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mb-4" style={{ borderColor: 'var(--app-border)' }}>
              {local.map(w => (
                <SortableWidgetItem key={w.id} widget={w} onToggle={handleToggle} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border py-2.5 text-sm transition hover:bg-white/[0.04]"
            style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #2f7cf6, #06b6d4)' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const notify = useNotify()
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeRange, setActiveRange] = useState('ALL')
  const [widgets, setWidgets] = useState(loadWidgets)
  const [showCustomize, setShowCustomize] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load(showSpinner = true) {
      try {
        if (showSpinner) setLoading(true)
        setError('')
        const [a, s, h, p] = await Promise.all([fetchAssets(), fetchPortfolioSummary(), fetchPortfolioHistory(), fetchPrices()])
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

  const { score, breakdown } = useMemo(
    () => calculateWellnessScore(assets, { monthlyChangePct: summary?.monthlyChangePct ?? null }),
    [assets, summary]
  )
  const healthStatus = useMemo(() => getWellnessStatus(score), [score])
  const insights = useMemo(() => buildPortfolioInsights(assets, summary, prices), [assets, prices, summary])

  const pieData = useMemo(() => {
    const grouped = {}
    assets.forEach(a => { grouped[a.category] = (grouped[a.category] || 0) + a.value })
    return Object.entries(grouped).map(([key, value]) => ({ name: ASSET_CATEGORIES[key], value, key })).sort((a, b) => b.value - a.value)
  }, [assets])

  const filteredHistory = useMemo(() => {
    const range = TIME_RANGES.find(r => r.label === activeRange)
    if (!range || range.months === Infinity) return history
    return history.slice(-range.months)
  }, [history, activeRange])

  const topHoldings = useMemo(() => [...assets].sort((a, b) => b.value - a.value).slice(0, 5)
    .map(a => ({ ...a, gain: a.value - a.cost, gainPct: a.cost > 0 ? ((a.value - a.cost) / a.cost) * 100 : 0 })), [assets])

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
      notify({ type: 'success', title: 'Prices refreshed', message: 'Dashboard data updated.' })
    } catch (err) {
      setError(err.message || 'Failed to refresh prices.')
      notify({ type: 'error', title: 'Refresh failed', message: err.message })
    } finally {
      setIsRefreshing(false)
    }
  }

  function handleWidgetChange(newWidgets) {
    setWidgets(newWidgets)
    saveWidgets(newWidgets)
    notify({ type: 'info', title: 'Dashboard updated', message: 'Your layout has been saved.' })
  }

  // ── Export helpers ────────────────────────────────────────
  function getExportData() {
    const kpis = [
      { label: 'Total Net Worth', value: formatCurrency(totalNetWorth) },
      { label: 'Monthly Change', value: `${formatChange(monthlyChange)} (${monthlyChangePct}%)` },
      { label: 'Total P&L', value: `${formatChange(totalGainLoss)} (${gainLossPct}%)` },
      { label: 'Wellness Score', value: `${score}/100 — ${healthStatus.label}` },
    ]
    const holdings = topHoldings.map(h => ({ name: h.name, category: ASSET_CATEGORIES[h.category] || h.category, value: h.value, cost: h.cost, pnl: h.gain }))
    const allocation = pieData.map(p => ({ name: p.name, value: p.value, pct: totalNetWorth > 0 ? (p.value / totalNetWorth) * 100 : 0 }))
    const generatedAt = new Date().toLocaleString('en-SG')
    return { kpis, holdings, allocation, generatedAt }
  }

  function handleExportPDF() {
    exportDashboardPDF(getExportData())
    notify({ type: 'success', title: 'PDF exported', message: 'Dashboard report downloaded.' })
  }

  function handleExportExcel() {
    exportDashboardExcel(getExportData())
    notify({ type: 'success', title: 'Excel exported', message: 'Dashboard spreadsheet downloaded.' })
  }

  // ── Visible widgets in order ──────────────────────────────
  const visible = widgets.filter(w => w.visible !== false)
  const isVisible = useCallback((id) => visible.some(w => w.id === id), [visible])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="glass-card p-8 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Loading portfolio data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="glass-card p-8 border border-red-500/20">
          <h2 className="font-semibold" style={{ color: 'var(--app-text)' }}>Dashboard unavailable</h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>Wealth Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--app-text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {lastSync ? `Last synced ${lastSync}` : 'Prices not yet synced'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} />
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-white/[0.07]"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text-soft)' }}
          >
            <Settings2 className="h-4 w-4" />
            Customize
          </button>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="app-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Widgets (in user-defined order) ─────────────────── */}
      {visible.map((widget, idx) => {
        if (widget.id === 'kpi') return (
          <div key="kpi" className="grid grid-cols-4 gap-5">
            <KpiCard label="Total Net Worth" value={formatCurrency(totalNetWorth)} valueClass="gradient-text text-3xl font-semibold tracking-tight" glow />
            <KpiCard label="This Month" value={formatChange(monthlyChange)} sub={`${monthlyChangePct}% vs last month`} positive={monthlyChange >= 0} />
            <KpiCard label="Total P&L" value={formatChange(totalGainLoss)} sub={`${gainLossPct}% on cost basis`} positive={totalGainLoss >= 0} />
            <KpiCard label="Wellness Score" value={`${score}/100`} sub={healthStatus.label} scoreColor={healthStatus.color} icon={<ShieldCheck className="h-4 w-4" style={{ color: healthStatus.color }} />} />
          </div>
        )

        if (widget.id === 'trend') {
          // render trend + allocation together if allocation is next visible widget
          const nextWidget = visible[idx + 1]
          if (nextWidget?.id === 'allocation') return null // rendered by allocation below
          // allocation hidden — trend is full width
          return (
            <div key="trend" className="glass-card p-6">
              <TrendChartContent filteredHistory={filteredHistory} activeRange={activeRange} setActiveRange={setActiveRange} />
            </div>
          )
        }

        if (widget.id === 'allocation') {
          const prevWidget = visible[idx - 1]
          if (prevWidget?.id === 'trend') {
            return (
              <div key="trend-allocation" className="grid grid-cols-5 gap-5">
                <div className="col-span-3 glass-card p-6">
                  <TrendChartContent filteredHistory={filteredHistory} activeRange={activeRange} setActiveRange={setActiveRange} />
                </div>
                <div className="col-span-2 glass-card p-6">
                  <AllocationContent pieData={pieData} totalNetWorth={totalNetWorth} />
                </div>
              </div>
            )
          }
          return (
            <div key="allocation" className="glass-card p-6">
              <AllocationContent pieData={pieData} totalNetWorth={totalNetWorth} />
            </div>
          )
        }

        if (widget.id === 'wellness') {
          const nextWidget = visible[idx + 1]
          if (nextWidget?.id === 'insights') return null // rendered by insights below
          return (
            <div key="wellness" className="glass-card p-6">
              <WellnessContent breakdown={breakdown} healthStatus={healthStatus} score={score} />
            </div>
          )
        }

        if (widget.id === 'insights') {
          const prevWidget = visible[idx - 1]
          if (prevWidget?.id === 'wellness') {
            return (
              <div key="wellness-insights" className="grid grid-cols-2 gap-5">
                <div className="glass-card p-6">
                  <WellnessContent breakdown={breakdown} healthStatus={healthStatus} score={score} />
                </div>
                <div className="glass-card p-6">
                  <InsightsContent insights={insights} />
                </div>
              </div>
            )
          }
          return (
            <div key="insights" className="glass-card p-6">
              <InsightsContent insights={insights} />
            </div>
          )
        }

        if (widget.id === 'holdings' && topHoldings.length > 0) {
          return (
            <div key="holdings" className="glass-card p-6">
              <SectionHeader title="Top Holdings" sub="Your 5 largest positions by value" />
              <div className="mt-5">
                <div className="grid grid-cols-5 gap-4 px-3 pb-2 border-b" style={{ borderColor: 'var(--app-border)' }}>
                  {['Asset', 'Category', 'Current Value', 'Gain / Loss', 'Return'].map(h => (
                    <p key={h} className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>{h}</p>
                  ))}
                </div>
                <div className="space-y-1 mt-1">
                  {topHoldings.map(asset => (
                    <div key={asset.id} className="grid grid-cols-5 gap-4 items-center px-3 py-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>{asset.name}</p>
                      <span className="text-xs px-2 py-1 rounded-lg w-fit" style={{ backgroundColor: `${CATEGORY_COLORS[asset.category]}18`, color: CATEGORY_COLORS[asset.category] }}>
                        {ASSET_CATEGORIES[asset.category] || asset.category}
                      </span>
                      <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{formatCurrency(asset.value)}</p>
                      <div className="flex items-center gap-1.5">
                        {asset.gain >= 0
                          ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                          : <ArrowDownRight className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                        }
                        <span className={`text-sm font-medium ${asset.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatChange(asset.gain)}</span>
                      </div>
                      <span className={`text-sm font-medium ${asset.gainPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {asset.gainPct >= 0 ? '+' : ''}{asset.gainPct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        }

        return null
      })}

      {visible.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>All widgets are hidden. Click <strong>Customize</strong> to restore them.</p>
        </div>
      )}

      {showCustomize && (
        <CustomizePanel widgets={widgets} onClose={() => setShowCustomize(false)} onChange={handleWidgetChange} />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function TrendChartContent({ filteredHistory, activeRange, setActiveRange }) {
  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <SectionHeader title="Net Worth Over Time" sub="Monthly snapshots" />
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 flex-shrink-0">
          {TIME_RANGES.map(r => (
            <button key={r.label} type="button" onClick={() => setActiveRange(r.label)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${activeRange === r.label ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>
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
          <YAxis tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => `${(v / 1000).toFixed(0)}K`} domain={['dataMin - 15000', 'dataMax + 15000']} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="value" stroke="#2f7cf6" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </>
  )
}

function AllocationContent({ pieData, totalNetWorth }) {
  return (
    <>
      <SectionHeader title="Asset Allocation" sub="Concentration by category" />
      <ResponsiveContainer width="100%" height={170} className="mt-3">
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} dataKey="value" stroke="none">
            {pieData.map(entry => <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-2">
        {pieData.map(entry => (
          <div key={entry.key} className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.key] }} />
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--app-text-muted)' }}>{entry.name}</span>
            <div className="flex items-center gap-2">
              <div className="h-1 w-14 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${totalNetWorth > 0 ? (entry.value / totalNetWorth) * 100 : 0}%`, backgroundColor: CATEGORY_COLORS[entry.key] }} />
              </div>
              <span className="text-xs font-medium w-8 text-right" style={{ color: 'var(--app-text-soft)' }}>
                {totalNetWorth > 0 ? ((entry.value / totalNetWorth) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function WellnessContent({ breakdown, healthStatus, score }) {
  return (
    <>
      <div className="flex items-start justify-between mb-5">
        <SectionHeader title="Wellness Breakdown" sub="The 8 factors behind your score" />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: healthStatus.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: healthStatus.color }}>{healthStatus.label}</span>
        </div>
      </div>
      <div className="space-y-4">
        {breakdown.map(item => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{item.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{item.detail}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'pass' ? 'bg-emerald-400/10 text-emerald-400' : item.status === 'neutral' ? 'bg-blue-400/10 text-blue-400' : 'bg-red-400/10 text-red-400'}`}>
                  {item.score}/{item.max}
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(item.score / item.max) * 100}%`, backgroundColor: item.status === 'pass' ? '#18a871' : item.status === 'neutral' ? '#2f7cf6' : '#e65054' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>Overall score</span>
        <span className="text-2xl font-semibold" style={{ color: healthStatus.color }}>{score}/100</span>
      </div>
    </>
  )
}

function InsightsContent({ insights }) {
  return (
    <>
      <SectionHeader title="Quick Insights" sub="Key risks and strengths" />
      <div className="mt-5 space-y-2">
        {insights.highlights.slice(0, 5).map(insight => (
          <div key={insight.title} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${insightBg[insight.type]}`}>
            <div className="mt-0.5 flex-shrink-0">{insightIcons[insight.type]}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>{insight.title}</p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--app-text-muted)' }}>{insight.message}</p>
            </div>
          </div>
        ))}
        {insights.highlights.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--app-text-muted)' }}>No insights available yet.</p>
        )}
      </div>
    </>
  )
}

function SectionHeader({ title, sub }) {
  return (
    <div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--app-text-soft)' }}>{title}</h3>
      <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{sub}</p>
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
      <p className={valueClass ?? `text-2xl font-semibold ${scoreColor ? '' : isNeutral ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400'}`}
        style={scoreColor ? { color: scoreColor } : undefined}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1.5" style={scoreColor ? { color: `${scoreColor}99` } : undefined}>
          <span className={scoreColor ? 'font-semibold' : positive === false ? 'text-red-400/60' : 'text-white/35'}>{sub}</span>
        </p>
      )}
    </div>
  )
}
