import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Link2, Pencil, RefreshCw, Search, Trash2, Wallet, CheckSquare, Square } from 'lucide-react'
import AssetForm from '../components/AssetForm'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { deleteAsset, fetchAssetsPage, fetchPrices, refreshPrices, updateAsset } from '../services/api.js'
import { summarizeAssetDetails } from '../data/assetDetails.js'
import { useNotify } from '../context/NotificationContext'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

// ── Asset logo helpers ────────────────────────────────────────
const CRYPTO_LOGO_MAP = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
  UNI: 'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/small/litecoin.png',
}

const STOCK_DOMAIN_MAP = {
  AAPL: 'apple.com', MSFT: 'microsoft.com', GOOGL: 'google.com', GOOG: 'google.com',
  AMZN: 'amazon.com', TSLA: 'tesla.com', NVDA: 'nvidia.com', META: 'meta.com',
  NFLX: 'netflix.com', DIS: 'disney.com', V: 'visa.com', MA: 'mastercard.com',
  JPM: 'jpmorganchase.com', BAC: 'bankofamerica.com', WMT: 'walmart.com',
  JNJ: 'jnj.com', PG: 'pg.com', KO: 'coca-cola.com', PEP: 'pepsico.com',
  'D05.SI': 'dbs.com', 'O39.SI': 'ocbc.com', 'U11.SI': 'uobgroup.com',
  'Z74.SI': 'singtel.com', 'C6L.SI': 'singaporeair.com', 'BN4.SI': 'keppelcorp.com',
}

function getAssetLogoUrl(asset) {
  const ticker = (asset.ticker || '').toUpperCase().replace('.SI', '')
  if (asset.category === 'CRYPTO') return CRYPTO_LOGO_MAP[ticker] || null
  if (asset.category === 'STOCKS') {
    const domain = STOCK_DOMAIN_MAP[asset.ticker] || STOCK_DOMAIN_MAP[ticker]
    if (domain) return `https://logo.clearbit.com/${domain}`
  }
  return null
}

function getInitialParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || 'ALL',
    pricing: searchParams.get('pricing') || 'ALL',
    sortBy: searchParams.get('sortBy') || 'value',
    sortDirection: searchParams.get('sortDirection') || 'desc',
    page: Number.parseInt(searchParams.get('page') || '1', 10) || 1,
  }
}

export default function Assets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialParams = getInitialParams(searchParams)
  const notify = useNotify()

  const [assets, setAssets] = useState([])
  const [prices, setPrices] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: 6, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState(initialParams.search)
  const [debouncedSearch, setDebouncedSearch] = useState(initialParams.search)
  const [categoryFilter, setCategoryFilter] = useState(initialParams.category)
  const [pricingFilter, setPricingFilter] = useState(initialParams.pricing)
  const [sortBy, setSortBy] = useState(initialParams.sortBy)
  const [sortDirection, setSortDirection] = useState(initialParams.sortDirection)
  const [page, setPage] = useState(initialParams.page)

  // ── Multi-select ──────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set())
  const allOnPageSelected = assets.length > 0 && assets.every(a => selected.has(a.id))
  const someSelected = selected.size > 0

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        assets.forEach(a => next.delete(a.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        assets.forEach(a => next.add(a.id))
        return next
      })
    }
  }

  function clearSelection() { setSelected(new Set()) }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const p = {}
    if (search) p.search = search
    if (categoryFilter !== 'ALL') p.category = categoryFilter
    if (pricingFilter !== 'ALL') p.pricing = pricingFilter
    if (sortBy !== 'value') p.sortBy = sortBy
    if (sortDirection !== 'desc') p.sortDirection = sortDirection
    if (page > 1) p.page = String(page)
    setSearchParams(p, { replace: true })
  }, [search, categoryFilter, pricingFilter, sortBy, sortDirection, page, setSearchParams])

  useEffect(() => { setPage(1) }, [debouncedSearch, categoryFilter, pricingFilter])

  useEffect(() => {
    let cancelled = false

    async function loadAssets(showSpinner = true) {
      try {
        if (showSpinner) setLoading(true)
        setError('')
        const [assetResult, priceRows] = await Promise.all([
          fetchAssetsPage({ page, pageSize: pagination.pageSize, search: debouncedSearch, category: categoryFilter, pricing: pricingFilter, sortBy, sortDirection }),
          fetchPrices(),
        ])
        if (cancelled) return
        setAssets(assetResult.items)
        setPagination(assetResult.pagination)
        if (assetResult.pagination.totalPages > 0 && page > assetResult.pagination.totalPages)
          setPage(assetResult.pagination.totalPages)
        setPrices(priceRows)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load assets.')
      } finally {
        if (!cancelled && showSpinner) setLoading(false)
      }
    }

    loadAssets()
    const id = window.setInterval(() => loadAssets(false), 60000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [page, debouncedSearch, categoryFilter, pricingFilter, sortBy, sortDirection, pagination.pageSize])

  const stats = useMemo(() => {
    const liveTracked = assets.filter(a => a.ticker && a.quantity != null).length
    return { count: pagination.total, liveTracked, manual: assets.length - liveTracked, totalValue: assets.reduce((s, a) => s + a.value, 0) }
  }, [assets, pagination.total])

  const latestPriceTime = prices[0]?.updated_at
    ? new Date(prices[0].updated_at).toLocaleString('en-SG')
    : 'No live refresh yet'

  async function reloadCurrentPage() {
    const [assetResult, priceRows] = await Promise.all([
      fetchAssetsPage({ page, pageSize: pagination.pageSize, search: debouncedSearch, category: categoryFilter, pricing: pricingFilter, sortBy, sortDirection }),
      fetchPrices(),
    ])
    setAssets(assetResult.items)
    setPagination(assetResult.pagination)
    setPrices(priceRows)
  }

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      await refreshPrices()
      await reloadCurrentPage()
      notify({ type: 'success', title: 'Prices refreshed', message: 'Live prices updated successfully.' })
    } catch (err) {
      notify({ type: 'error', title: 'Refresh failed', message: err.message })
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm('Delete this asset? This cannot be undone.')) return
    try {
      await deleteAsset(id)
      const nextPage = assets.length === 1 && page > 1 ? page - 1 : page
      setPage(nextPage)
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      notify({ type: 'success', title: 'Asset deleted', message: name ? `"${name}" was removed.` : undefined })
    } catch (err) {
      notify({ type: 'error', title: 'Delete failed', message: err.message })
    }
  }

  async function handleBulkDelete() {
    const count = selected.size
    if (!window.confirm(`Delete ${count} selected asset${count > 1 ? 's' : ''}? This cannot be undone.`)) return
    try {
      await Promise.all([...selected].map(id => deleteAsset(id)))
      clearSelection()
      const nextPage = assets.length <= count && page > 1 ? page - 1 : page
      setPage(nextPage)
      await reloadCurrentPage()
      notify({ type: 'success', title: `${count} asset${count > 1 ? 's' : ''} deleted`, message: 'Selected assets have been removed.' })
    } catch (err) {
      notify({ type: 'error', title: 'Bulk delete failed', message: err.message })
    }
  }

  async function handleUpdate(payload) {
    if (!editingAsset) return
    try {
      setIsSaving(true)
      setSubmitError('')
      await updateAsset(editingAsset.id, payload)
      setEditingAsset(null)
      await reloadCurrentPage()
      notify({ type: 'success', title: 'Asset updated', message: `"${editingAsset.name}" was saved.` })
    } catch (err) {
      setSubmitError(err.message || 'Update failed.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleExport() {
    const headers = ['Name', 'Category', 'Ticker', 'Institution', 'Value SGD', 'Cost SGD', 'Quantity', 'Date', 'Details']
    const rows = assets.map(a => [
      a.name, ASSET_CATEGORIES[a.category] || a.category, a.ticker || '',
      a.institution || '', a.value, a.cost, a.quantity ?? '',
      a.date ? String(a.date).slice(0, 10) : '', summarizeAssetDetails(a),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'safeseven-assets.csv'; link.click()
    URL.revokeObjectURL(url)
    notify({ type: 'info', title: 'CSV exported', message: `${assets.length} assets exported.` })
  }

  function toggleSort(nextSortBy) {
    if (sortBy === nextSortBy) { setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortBy(nextSortBy)
    setSortDirection(nextSortBy === 'asset' || nextSortBy === 'category' ? 'asc' : 'desc')
    setPage(1)
  }

  if (loading) return <div className="glass-card p-6 text-sm text-white/70">Loading asset inventory...</div>

  if (error) {
    return (
      <div className="glass-card p-6">
        <h1 className="text-xl font-bold text-white">Assets unavailable</h1>
        <p className="mt-2 text-sm text-white/60">{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Link
        to="/account"
        className="flex items-center justify-between gap-4 rounded-3xl border px-5 py-4 transition-all hover:border-accent/30 hover:bg-accent/[0.04]"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl flex items-center justify-center bg-accent/10 flex-shrink-0">
            <Link2 className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>Connect Data Sources</p>
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Link Singpass · Bank Accounts · Crypto Wallets</p>
          </div>
        </div>
        <span className="text-xs font-medium text-accent">Open →</span>
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>Asset Inventory</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>Manage every asset record that feeds the SafeSeven dashboard.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-white/[0.07] disabled:opacity-60"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text-soft)' }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Assets" value={stats.count} detail="Matching records" icon={Wallet} />
        <StatCard label="Live Tracked" value={stats.liveTracked} detail="Current page" icon={RefreshCw} />
        <StatCard label="Manual Assets" value={stats.manual} detail="Current page" icon={Pencil} />
        <StatCard label="Portfolio Value" value={formatCurrency(stats.totalValue)} detail={`Last sync: ${latestPriceTime}`} />
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_auto] gap-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--app-text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assets, institutions, or details"
              className="app-input pl-11"
            />
          </label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="app-input">
            <option value="ALL">All Categories</option>
            {Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={pricingFilter} onChange={e => setPricingFilter(e.target.value)} className="app-input">
            <option value="ALL">All Pricing</option>
            <option value="LIVE">Live-priced</option>
            <option value="MANUAL">Manual-valued</option>
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition hover:bg-white/[0.07]"
            style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text-soft)' }}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div
          className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-3"
          style={{ borderColor: 'rgba(47,124,246,0.25)', background: 'rgba(47,124,246,0.08)' }}
        >
          <span className="text-sm font-medium text-accent">
            {selected.size} asset{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition hover:bg-white/[0.06]"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size} selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div
          className="grid gap-4 border-b px-6 py-4 text-xs uppercase tracking-[0.18em]"
          style={{ gridTemplateColumns: '36px 2fr 1fr 1fr 1fr 1fr 1fr', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
        >
          {/* Select all checkbox */}
          <button type="button" onClick={toggleSelectAll} className="flex items-center justify-center">
            {allOnPageSelected
              ? <CheckSquare className="h-4 w-4 text-accent" />
              : <Square className="h-4 w-4 opacity-40" />
            }
          </button>
          <SortHeader label="Asset"    active={sortBy === 'asset'}    direction={sortDirection} onClick={() => toggleSort('asset')} />
          <SortHeader label="Category" active={sortBy === 'category'} direction={sortDirection} onClick={() => toggleSort('category')} />
          <SortHeader label="Value"    active={sortBy === 'value'}    direction={sortDirection} onClick={() => toggleSort('value')} />
          <SortHeader label="Cost"     active={sortBy === 'cost'}     direction={sortDirection} onClick={() => toggleSort('cost')} />
          <SortHeader label="P&L"      active={sortBy === 'pnl'}      direction={sortDirection} onClick={() => toggleSort('pnl')} />
          <span>Actions</span>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
          {assets.map(asset => {
            const gainLoss = asset.value - asset.cost
            const gainLossPct = asset.cost > 0 ? (gainLoss / asset.cost) * 100 : 0
            const detailSummary = summarizeAssetDetails(asset)
            const isSelected = selected.has(asset.id)

            return (
              <div
                key={asset.id}
                className="grid gap-4 px-6 py-5 text-sm transition-colors"
                style={{
                  gridTemplateColumns: '36px 2fr 1fr 1fr 1fr 1fr 1fr',
                  background: isSelected ? 'rgba(47,124,246,0.05)' : undefined,
                }}
              >
                {/* Row checkbox */}
                <button type="button" onClick={() => toggleSelect(asset.id)} className="flex items-center justify-center">
                  {isSelected
                    ? <CheckSquare className="h-4 w-4 text-accent" />
                    : <Square className="h-4 w-4 opacity-30 hover:opacity-60 transition-opacity" />
                  }
                </button>

                <div className="min-w-0 flex items-center gap-3">
                  <AssetLogo asset={asset} />
                  <div className="min-w-0">
                    <div className="font-medium truncate" style={{ color: 'var(--app-text)' }}>{asset.name}</div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {asset.ticker || asset.institution || 'Manual asset'}
                      {asset.quantity != null ? ` • Qty ${asset.quantity}` : ''}
                    </div>
                    {detailSummary && <div className="mt-0.5 text-xs truncate" style={{ color: 'var(--app-text-muted)', opacity: 0.7 }}>{detailSummary}</div>}
                  </div>
                </div>

                <div className="flex items-center">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{ color: CATEGORY_COLORS[asset.category], backgroundColor: `${CATEGORY_COLORS[asset.category]}20` }}
                  >
                    {ASSET_CATEGORIES[asset.category] || asset.category}
                  </span>
                </div>

                <div className="flex items-center" style={{ color: 'var(--app-text-soft)' }}>{formatCurrency(asset.value)}</div>
                <div className="flex items-center" style={{ color: 'var(--app-text-muted)' }}>{formatCurrency(asset.cost)}</div>
                <div className={`flex items-center font-medium ${gainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)} ({gainLossPct.toFixed(1)}%)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingAsset(asset); setSubmitError('') }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition hover:bg-white/[0.05]"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(asset.id, asset.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          {!assets.length && (
            <div className="px-6 py-10 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
              No assets match the current search or filters.
            </div>
          )}
        </div>

        {/* Pagination */}
        <div
          className="flex items-center justify-between border-t px-6 py-4 text-sm"
          style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
        >
          <span>
            Showing {pagination.total === 0 ? 0 : (page - 1) * pagination.pageSize + 1}–{Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition hover:bg-white/[0.05] disabled:opacity-40"
              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 text-xs uppercase tracking-[0.18em]">Page {page} / {pagination.totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition hover:bg-white/[0.05] disabled:opacity-40"
              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editingAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-900/80 px-6 backdrop-blur-sm">
          <div className="glass-card w-full max-w-3xl p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--app-text)' }}>Edit Asset</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>Update the record and keep the dashboard in sync.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}
              >
                Close
              </button>
            </div>
            <AssetForm
              initialAsset={editingAsset}
              onSubmit={handleUpdate}
              submitLabel="Save Changes"
              isSubmitting={isSaving}
              submitError={submitError}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-left"
      style={{ color: active ? 'var(--app-text-soft)' : 'var(--app-text-muted)' }}
    >
      {label}
      <ArrowDownUp className={`h-3.5 w-3.5 ${active && direction === 'asc' ? 'rotate-180' : ''}`} />
    </button>
  )
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--app-text-muted)' }}>{label}</p>
          <p className="mt-3 text-2xl font-bold" style={{ color: 'var(--app-text)' }}>{value}</p>
          <p className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>{detail}</p>
        </div>
        {Icon && (
          <div className="rounded-2xl border p-3 text-accent" style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  )
}

function AssetLogo({ asset }) {
  const [failed, setFailed] = useState(false)
  const url = getAssetLogoUrl(asset)
  const initial = (asset.name || '?')[0].toUpperCase()
  const color = CATEGORY_COLORS[asset.category] || '#2f7cf6'

  if (!url || failed) {
    return (
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold"
        style={{ backgroundColor: `${color}22`, border: `1px solid ${color}30`, color }}
      >
        {initial}
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={asset.name}
      onError={() => setFailed(true)}
      className="h-9 w-9 flex-shrink-0 rounded-xl object-contain p-0.5"
      style={{ backgroundColor: `${CATEGORY_COLORS[asset.category]}12`, border: `1px solid ${CATEGORY_COLORS[asset.category]}20` }}
    />
  )
}
