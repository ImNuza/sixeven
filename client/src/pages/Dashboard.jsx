import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  AlertTriangle, CheckCircle, Info, RefreshCw, ShieldCheck, Clock,
  ArrowUpRight, ArrowDownRight, Settings2, GripVertical, EyeOff, Eye, X,
  UserRound, Globe2, Briefcase, Wallet, Landmark, Building2, Link2,
  Banknote, TrendingUp, Coins, Package, Shield, Home,
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
import { fetchDashboardData, refreshPrices } from '../services/api.js'
import { buildPortfolioInsights } from '../data/portfolioInsights.js'
import ExportMenu from '../components/ExportMenu'
import { exportDashboardPDF, exportDashboardExcel } from '../utils/exportReport'
import { useNotify } from '../context/NotificationContext'
import { useAuth } from '../auth/AuthContext.jsx'
import { loadOnboardingProfile } from '../onboarding/storage.js'

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
  const { user } = useAuth()
  const [onboardingProfile, setOnboardingProfile] = useState(() => loadOnboardingProfile(user?.id))
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
  const [viewMode, setViewMode] = useState('client') // 'client' | 'advisor'

  useEffect(() => {
    let cancelled = false
    async function load(showSpinner = true) {
      try {
        if (showSpinner) setLoading(true)
        setError('')
        const data = await fetchDashboardData()
        if (cancelled) return
        setAssets(data.assets)
        setSummary(data.summary)
        setHistory(data.history)
        setPrices(data.prices)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard data.')
      } finally {
        if (!cancelled && showSpinner) setLoading(false)
      }
    }
    load()
    const id = window.setInterval(() => load(false), 45000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    setOnboardingProfile(loadOnboardingProfile(user?.id))
  }, [user?.id])

  useEffect(() => {
    function syncOnboardingProfile() {
      setOnboardingProfile(loadOnboardingProfile(user?.id))
    }

    window.addEventListener('safeseven:onboarding', syncOnboardingProfile)
    return () => window.removeEventListener('safeseven:onboarding', syncOnboardingProfile)
  }, [user?.id])

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
  const onboardingGoals = onboardingProfile?.financialGoals || []
  const onboardingWallets = onboardingProfile?.walletAddresses || []
  const onboardingHighlights = [
    { label: 'Country / Region', value: onboardingProfile?.country, icon: Globe2 },
    { label: 'Employment', value: onboardingProfile?.employmentStatus, icon: Briefcase },
    { label: 'Risk Appetite', value: onboardingProfile?.riskAppetite, icon: ShieldCheck },
    { label: 'Income Range', value: onboardingProfile?.incomeRange, icon: Landmark },
    { label: 'Monthly Expenses', value: onboardingProfile?.monthlyExpensesRange, icon: Wallet },
    { label: 'Other Debts', value: onboardingProfile?.otherDebts ? formatCurrency(onboardingProfile.otherDebts) : null, icon: AlertTriangle },
  ].filter((item) => item.value)
  const onboardingAssetSummary = [
    { label: 'Liquid Assets', value: onboardingProfile?.liquidAssets ? formatCurrency(onboardingProfile.liquidAssets) : null },
    { label: 'Manual Bank', value: onboardingProfile?.manualBankBalance ? formatCurrency(onboardingProfile.manualBankBalance) : null },
    { label: 'CPF', value: onboardingProfile?.cpfBalance ? formatCurrency(onboardingProfile.cpfBalance) : null },
    { label: 'Stocks', value: onboardingProfile?.stocksValue ? formatCurrency(onboardingProfile.stocksValue) : null },
    { label: 'Bonds', value: onboardingProfile?.bondsValue ? formatCurrency(onboardingProfile.bondsValue) : null },
    { label: 'Crypto', value: onboardingProfile?.cryptoValue ? formatCurrency(onboardingProfile.cryptoValue) : null },
    { label: 'Property', value: onboardingProfile?.propertyValue ? formatCurrency(onboardingProfile.propertyValue) : null },
  ].filter((item) => item.value)
  const integrationBadges = [
    onboardingProfile?.ocbcLinked ? 'OCBC linked' : onboardingProfile?.bankLinkMode ? onboardingProfile.bankLinkMode : null,
    onboardingProfile?.singpassLinked ? 'Singpass linked' : null,
    onboardingProfile?.moomooImported ? `moomoo imported${onboardingProfile.moomooAccountId ? ` (${onboardingProfile.moomooAccountId})` : ''}` : null,
  ].filter(Boolean)

  async function handleManualRefresh() {
    try {
      setIsRefreshing(true)
      setError('')
      await refreshPrices()
      const data = await fetchDashboardData()
      setAssets(data.assets)
      setSummary(data.summary)
      setHistory(data.history)
      setPrices(data.prices)
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
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
            {viewMode === 'advisor' ? 'Advisor Overview' : 'Wealth Dashboard'}
          </h1>
          {onboardingProfile?.fullName && (
            <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {onboardingProfile.fullName}
              {onboardingProfile.country ? ` · ${onboardingProfile.country}` : ''}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--app-text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {lastSync ? `Last synced ${lastSync}` : 'Prices not yet synced'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Client / Advisor toggle */}
          <div className="flex items-center rounded-xl border p-1" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
            {[
              { id: 'client',  label: 'Client View',  icon: UserRound },
              { id: 'advisor', label: 'Advisor View', icon: ShieldCheck },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                style={viewMode === id
                  ? { background: 'var(--app-accent)', color: '#fff' }
                  : { color: 'var(--app-text-muted)' }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
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

      {onboardingProfile && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="glass-card p-6 xl:col-span-2">
            <div className="flex items-start justify-between gap-4 mb-5">
              <SectionHeader title="Wealth Wellness Profile" sub="Saved from onboarding and reflected here for planning." />
              <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <UserRound className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--app-text-soft)' }}>
                  {onboardingProfile.fullName || onboardingProfile.username || 'Profile'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {onboardingHighlights.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)', background: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="h-3.5 w-3.5" style={{ color: 'var(--app-accent)' }} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>{label}</span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{value}</p>
                </div>
              ))}
            </div>

            {onboardingGoals.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--app-text-muted)' }}>Primary Goals</p>
                <div className="flex flex-wrap gap-2">
                  {onboardingGoals.map((goal) => (
                    <span key={goal} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: 'rgba(47,124,246,0.14)', color: '#8ec5ff' }}>
                      {goal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {integrationBadges.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--app-text-muted)' }}>Connected Sources</p>
                <div className="flex flex-wrap gap-2">
                  {integrationBadges.map((item) => (
                    <span key={item} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: 'rgba(24,168,113,0.12)', color: '#74dfb5' }}>
                      <Link2 className="h-3 w-3" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <SectionHeader title="Manual Inputs" sub="Values captured during onboarding." />
            <div className="mt-5 space-y-3">
              {onboardingAssetSummary.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{item.label}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{item.value}</span>
                </div>
              ))}
              {!onboardingAssetSummary.length && (
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>No manual values saved yet.</p>
              )}
            </div>

            {(onboardingProfile?.propertyLookup?.address || onboardingProfile?.propertyPostcode || onboardingWallets.length > 0) && (
              <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--app-border)' }}>
                {onboardingProfile?.propertyLookup?.address && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Building2 className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Property</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{onboardingProfile.propertyLookup.address}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                      {onboardingProfile.propertyPostcode ? `Postcode ${onboardingProfile.propertyPostcode}` : ''}
                      {onboardingProfile.propertyLookup?.hdb?.latestResalePrice ? ` · Latest HDB resale ${formatCurrency(onboardingProfile.propertyLookup.hdb.latestResalePrice)}` : ''}
                    </p>
                  </div>
                )}

                {onboardingWallets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4" style={{ color: 'var(--app-accent)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Wallets</span>
                    </div>
                    <div className="space-y-2">
                      {onboardingWallets.slice(0, 3).map((walletAddress) => (
                        <div key={walletAddress} className="rounded-xl px-3 py-2 text-xs font-mono" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--app-text-soft)' }}>
                          {walletAddress}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Widgets (in user-defined order) ─────────────────── */}
      {visible.map((widget, idx) => {
        if (widget.id === 'kpi') return (
          <div key="kpi" className="grid grid-cols-4 gap-5">
            <KpiCard label="Total Net Worth" value={formatCurrency(totalNetWorth)} valueClass="gradient-text text-3xl font-semibold tracking-tight" glow />
            <KpiCard label="This Month" value={formatChange(monthlyChange)} sub={`${monthlyChangePct}% vs last month`} positive={monthlyChange >= 0} />
            <KpiCard label="Total P&L" value={formatChange(totalGainLoss)} sub={`${gainLossPct}% on cost basis`} positive={totalGainLoss >= 0} />
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="app-kicker">Wellness Score</p>
                <ShieldCheck className="h-4 w-4" style={{ color: healthStatus.color }} />
              </div>
              <div className="flex items-center gap-3">
                <HealthRing score={score} color={healthStatus.color} size={56} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: healthStatus.color }}>{healthStatus.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>Financial health</p>
                </div>
              </div>
            </div>
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

      {/* ── Advisor Panel ────────────────────────────────────── */}
      {viewMode === 'advisor' && (
        <AdvisorPanel
          assets={assets}
          summary={summary}
          breakdown={breakdown}
          score={score}
          totalNetWorth={totalNetWorth}
          pieData={pieData}
          insights={insights}
        />
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
        {pieData.map(entry => {
          const Icon = CATEGORY_ICONS[entry.key] || Package
          const pct = totalNetWorth > 0 ? ((entry.value / totalNetWorth) * 100) : 0
          return (
            <div key={entry.key} className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${CATEGORY_COLORS[entry.key]}20` }}>
                <Icon className="h-3 w-3" style={{ color: CATEGORY_COLORS[entry.key] }} />
              </div>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--app-text-muted)' }}>{entry.name}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-14 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[entry.key] }} />
                </div>
                <span className="text-xs font-medium w-8 text-right" style={{ color: 'var(--app-text-soft)' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WellnessContent({ breakdown, healthStatus, score }) {
  return (
    <>
      <div className="flex items-start justify-between mb-5">
        <SectionHeader title="Wellness Breakdown" sub="The 8 factors behind your score" />
        <HealthRing score={score} color={healthStatus.color} size={80} />
      </div>
      <div className="space-y-3">
        {breakdown.map(item => (
          <div key={item.label}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{item.label}</span>
                <span className="relative group/tip cursor-help">
                  <Info className="h-3 w-3" style={{ color: 'var(--app-text-muted)', opacity: 0.5 }} />
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover/tip:opacity-100 transition-opacity w-44 rounded-xl px-2.5 py-1.5 text-[11px] leading-snug shadow-xl"
                    style={{ background: 'var(--app-surface-strong)', border: '1px solid var(--app-border)', color: 'var(--app-text-soft)' }}>
                    {item.detail}
                  </span>
                </span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'pass' ? 'bg-emerald-400/10 text-emerald-400' : item.status === 'neutral' ? 'bg-blue-400/10 text-blue-400' : 'bg-red-400/10 text-red-400'}`}>
                {item.score}/{item.max}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(item.score / item.max) * 100}%`, backgroundColor: item.status === 'pass' ? '#18a871' : item.status === 'neutral' ? '#2f7cf6' : '#e65054' }} />
            </div>
          </div>
        ))}
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
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── Health Ring (SVG gauge) ───────────────────────────────────
function HealthRing({ score, color, size = 120 }) {
  const r = size * 0.36
  const stroke = size * 0.07
  const circumference = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(score, 100)) / 100 * circumference
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.9s ease' }}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill={color}>{score}</text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fontSize={size * 0.1} fill="rgba(255,255,255,0.35)">/100</text>
    </svg>
  )
}

// ── Category icons map ────────────────────────────────────────
const CATEGORY_ICONS = {
  CASH: Banknote, STOCKS: TrendingUp, BONDS: Landmark,
  CRYPTO: Coins, PROPERTY: Home, CPF: Shield, OTHER: Package,
}

// ── Advisor Panel ─────────────────────────────────────────────
function AdvisorPanel({ assets, summary, breakdown, score, totalNetWorth, pieData, insights }) {
  const { color: healthColor, label: healthLabel } = useMemo(() => {
    if (score >= 80) return { color: '#18a871', label: 'Excellent' }
    if (score >= 65) return { color: '#2f7cf6', label: 'Good' }
    if (score >= 45) return { color: '#f59e0b', label: 'Fair' }
    return { color: '#e65054', label: 'At Risk' }
  }, [score])

  // Liquidity ratio
  const liquidCategories = new Set(['CASH', 'STOCKS', 'CRYPTO'])
  const liquidValue = assets.filter(a => liquidCategories.has(a.category)).reduce((s, a) => s + a.value, 0)
  const liquidPct = totalNetWorth > 0 ? ((liquidValue / totalNetWorth) * 100).toFixed(1) : '0.0'

  // Concentration (largest single category %)
  const maxCat = pieData.length > 0 ? pieData[0] : null
  const maxCatPct = maxCat && totalNetWorth > 0 ? ((maxCat.value / totalNetWorth) * 100).toFixed(1) : '0.0'

  // CPF breakdown
  const cpfAssets = assets.filter(a => a.category === 'CPF')
  const cpfTotal = cpfAssets.reduce((s, a) => s + a.value, 0)

  // Issues from insights
  const warnings = insights.highlights.filter(i => i.type === 'warning')
  const positives = insights.highlights.filter(i => i.type === 'positive')

  const advisorNotes = [
    maxCatPct > 45 ? `Concentration risk: ${maxCat?.name} is ${maxCatPct}% of portfolio — consider rebalancing` : null,
    liquidPct < 20 ? `Liquidity gap: only ${liquidPct}% in liquid assets — recommend increasing cash buffer` : null,
    cpfTotal > 0 ? `CPF holdings: SGD ${cpfTotal.toLocaleString()} — review OA/SA/MA allocation for retirement readiness` : null,
    score < 50 ? `Health score ${score}/100 — client needs immediate attention across multiple dimensions` : null,
    score >= 80 ? `Portfolio is well-structured with ${healthLabel.toLowerCase()} health — focus on growth optimization` : null,
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      {/* Risk Flags */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <SectionHeader title="Advisor Dashboard" sub="Deep analytics · risk flags · discussion points" />
          <div className="flex items-center gap-2">
            <HealthRing score={score} color={healthColor} size={72} />
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: healthColor }}>{healthLabel}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>Wellness score</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Liquidity Ratio', value: `${liquidPct}%`, ok: parseFloat(liquidPct) >= 20, hint: '≥ 20% target' },
            { label: 'Max Concentration', value: `${maxCatPct}%`, ok: parseFloat(maxCatPct) <= 45, hint: maxCat?.name || '—' },
            { label: 'CPF Holdings', value: cpfTotal > 0 ? `SGD ${Math.round(cpfTotal / 1000)}K` : 'None', ok: true, hint: 'Retirement account' },
          ].map(({ label, value, ok, hint }) => (
            <div key={label} className="rounded-2xl border px-4 py-3" style={{ borderColor: ok ? 'rgba(24,168,113,0.2)' : 'rgba(230,80,84,0.25)', background: ok ? 'rgba(24,168,113,0.04)' : 'rgba(230,80,84,0.04)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--app-text-muted)' }}>{label}</p>
              <p className="text-xl font-semibold" style={{ color: ok ? '#18a871' : '#e65054' }}>{value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{hint}</p>
            </div>
          ))}
        </div>

        {/* 8-factor detail */}
        <div className="grid grid-cols-2 gap-3">
          {breakdown.map(item => (
            <div key={item.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--app-text-soft)' }}>{item.label}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${item.status === 'pass' ? 'bg-emerald-400/10 text-emerald-400' : item.status === 'neutral' ? 'bg-blue-400/10 text-blue-400' : 'bg-red-400/10 text-red-400'}`}>
                  {item.score}/{item.max}
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(item.score / item.max) * 100}%`, backgroundColor: item.status === 'pass' ? '#18a871' : item.status === 'neutral' ? '#2f7cf6' : '#e65054' }} />
              </div>
              <p className="text-[10px] mt-1" style={{ color: 'var(--app-text-muted)' }}>{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Advisor Notes */}
      {advisorNotes.length > 0 && (
        <div className="glass-card p-6">
          <SectionHeader title="Advisor Notes" sub="Discussion points and action items for this client" />
          <div className="mt-4 space-y-2">
            {advisorNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-yellow-400/15 bg-yellow-400/[0.04] px-3.5 py-3">
                <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{note}</p>
              </div>
            ))}
            {positives.slice(0, 2).map((insight) => (
              <div key={insight.title} className="flex items-start gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-3.5 py-3">
                <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{insight.title} — {insight.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
