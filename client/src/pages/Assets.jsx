import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, Pencil, PlusCircle, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import AssetForm from '../components/AssetForm'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { deleteAsset, fetchAssetsPage, fetchPrices, refreshPrices, updateAsset } from '../services/api.js'
import { summarizeAssetDetails } from '../data/assetDetails.js'

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
  if (asset.category === 'CRYPTO') {
    return CRYPTO_LOGO_MAP[ticker] || null
  }
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
  const [assets, setAssets] = useState([])
  const [prices, setPrices] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 6,
    total: 0,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [search])

  useEffect(() => {
    const nextParams = {}
    if (search) nextParams.search = search
    if (categoryFilter !== 'ALL') nextParams.category = categoryFilter
    if (pricingFilter !== 'ALL') nextParams.pricing = pricingFilter
    if (sortBy !== 'value') nextParams.sortBy = sortBy
    if (sortDirection !== 'desc') nextParams.sortDirection = sortDirection
    if (page > 1) nextParams.page = String(page)
    setSearchParams(nextParams, { replace: true })
  }, [search, categoryFilter, pricingFilter, sortBy, sortDirection, page, setSearchParams])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, categoryFilter, pricingFilter])

  useEffect(() => {
    let cancelled = false

    async function loadAssets(showSpinner = true) {
      try {
        if (showSpinner) {
          setLoading(true)
        }
        setError('')

        const [assetResult, priceRows] = await Promise.all([
          fetchAssetsPage({
            page,
            pageSize: pagination.pageSize,
            search: debouncedSearch,
            category: categoryFilter,
            pricing: pricingFilter,
            sortBy,
            sortDirection,
          }),
          fetchPrices(),
        ])

        if (cancelled) {
          return
        }

        setAssets(assetResult.items)
        setPagination(assetResult.pagination)
        if (assetResult.pagination.totalPages > 0 && page > assetResult.pagination.totalPages) {
          setPage(assetResult.pagination.totalPages)
        }
        setPrices(priceRows)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load assets.')
        }
      } finally {
        if (!cancelled && showSpinner) {
          setLoading(false)
        }
      }
    }

    loadAssets()
    const intervalId = window.setInterval(() => {
      loadAssets(false)
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [page, debouncedSearch, categoryFilter, pricingFilter, sortBy, sortDirection, pagination.pageSize])

  const stats = useMemo(() => {
    const liveTracked = assets.filter((asset) => asset.ticker && asset.quantity != null).length
    const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0)
    return {
      count: pagination.total,
      liveTracked,
      manual: assets.length - liveTracked,
      totalValue,
    }
  }, [assets, pagination.total])

  const latestPriceTime = prices[0]?.updated_at
    ? new Date(prices[0].updated_at).toLocaleString('en-SG')
    : 'No live refresh yet'

  async function reloadCurrentPage() {
    const [assetResult, priceRows] = await Promise.all([
      fetchAssetsPage({
        page,
        pageSize: pagination.pageSize,
        search: debouncedSearch,
        category: categoryFilter,
        pricing: pricingFilter,
        sortBy,
        sortDirection,
      }),
      fetchPrices(),
    ])

    setAssets(assetResult.items)
    setPagination(assetResult.pagination)
    setPrices(priceRows)
  }

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      setBanner('')
      await refreshPrices()
      await reloadCurrentPage()
      setBanner('Live prices refreshed successfully.')
    } catch (err) {
      setBanner(err.message || 'Price refresh failed.')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm('Delete this asset? This cannot be undone.')
    if (!confirmed) {
      return
    }

    try {
      await deleteAsset(id)
      const nextPage = assets.length === 1 && page > 1 ? page - 1 : page
      setPage(nextPage)
      setBanner('Asset deleted.')
    } catch (err) {
      setBanner(err.message || 'Delete failed.')
    }
  }

  async function handleUpdate(payload) {
    if (!editingAsset) {
      return
    }

    try {
      setIsSaving(true)
      setSubmitError('')
      await updateAsset(editingAsset.id, payload)
      setEditingAsset(null)
      await reloadCurrentPage()
      setBanner('Asset updated.')
    } catch (err) {
      setSubmitError(err.message || 'Update failed.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleExport() {
    const headers = ['Name', 'Category', 'Ticker', 'Institution', 'Value SGD', 'Cost SGD', 'Quantity', 'Date', 'Details']
    const rows = assets.map((asset) => [
      asset.name,
      ASSET_CATEGORIES[asset.category] || asset.category,
      asset.ticker || '',
      asset.institution || '',
      asset.value,
      asset.cost,
      asset.quantity ?? '',
      asset.date ? String(asset.date).slice(0, 10) : '',
      summarizeAssetDetails(asset),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'safeseven-assets.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function toggleSort(nextSortBy) {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortBy(nextSortBy)
    setSortDirection(nextSortBy === 'asset' || nextSortBy === 'category' ? 'asc' : 'desc')
    setPage(1)
  }

  if (loading) {
    return <div className="glass-card p-6 text-sm text-white/70">Loading asset inventory...</div>
  }

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Asset Inventory</h1>
          <p className="mt-1 text-sm text-white/40">
            Manage every asset record that feeds the SafeSeven dashboard.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.07] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>

          <Link
            to="/add"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-blue-600 px-4 py-3 text-sm font-semibold text-white"
          >
            <PlusCircle className="h-4 w-4" />
            Add Asset
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Assets" value={stats.count} detail="Matching records" icon={Wallet} />
        <StatCard label="Live Tracked" value={stats.liveTracked} detail="Current page" icon={RefreshCw} />
        <StatCard label="Manual Assets" value={stats.manual} detail="Current page" icon={Pencil} />
        <StatCard label="Portfolio Value" value={formatCurrency(stats.totalValue)} detail={`Current page • Last sync: ${latestPriceTime}`} />
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_auto] gap-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search assets, institutions, or details"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-accent/40"
            />
          </label>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="ALL">All Categories</option>
            {Object.entries(ASSET_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={pricingFilter}
            onChange={(event) => setPricingFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/40"
          >
            <option value="ALL">All Pricing</option>
            <option value="LIVE">Live-priced</option>
            <option value="MANUAL">Manual-valued</option>
          </select>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.07]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {banner ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
          {banner}
        </div>
      ) : null}

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-white/[0.06] px-6 py-4 text-xs uppercase tracking-[0.18em] text-white/35">
          <SortHeader label="Asset" active={sortBy === 'asset'} direction={sortDirection} onClick={() => toggleSort('asset')} />
          <SortHeader label="Category" active={sortBy === 'category'} direction={sortDirection} onClick={() => toggleSort('category')} />
          <SortHeader label="Value" active={sortBy === 'value'} direction={sortDirection} onClick={() => toggleSort('value')} />
          <SortHeader label="Cost" active={sortBy === 'cost'} direction={sortDirection} onClick={() => toggleSort('cost')} />
          <SortHeader label="P&L" active={sortBy === 'pnl'} direction={sortDirection} onClick={() => toggleSort('pnl')} />
          <span>Actions</span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {assets.map((asset) => {
            const gainLoss = asset.value - asset.cost
            const gainLossPct = asset.cost > 0 ? (gainLoss / asset.cost) * 100 : 0
            const detailSummary = summarizeAssetDetails(asset)

            return (
              <div
                key={asset.id}
                className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-5 text-sm"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <AssetLogo asset={asset} />
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{asset.name}</div>
                    <div className="mt-0.5 text-xs text-white/40">
                      {asset.ticker || asset.institution || 'Manual asset'}
                      {asset.quantity != null ? ` • Qty ${asset.quantity}` : ''}
                    </div>
                    {detailSummary ? (
                      <div className="mt-0.5 text-xs text-white/30 truncate">{detailSummary}</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{
                      color: CATEGORY_COLORS[asset.category],
                      backgroundColor: `${CATEGORY_COLORS[asset.category]}20`,
                    }}
                  >
                    {ASSET_CATEGORIES[asset.category] || asset.category}
                  </span>
                </div>

                <div className="flex items-center text-white/80">{formatCurrency(asset.value)}</div>
                <div className="flex items-center text-white/60">{formatCurrency(asset.cost)}</div>
                <div className={`flex items-center font-medium ${gainLoss >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {gainLoss >= 0 ? '+' : ''}{formatCurrency(gainLoss)} ({gainLossPct.toFixed(1)}%)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAsset(asset)
                      setSubmitError('')
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.05]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(asset.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
          {!assets.length ? (
            <div className="px-6 py-10 text-center text-sm text-white/45">
              No assets match the current search or filters.
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4 text-sm text-white/50">
          <span>
            Showing {pagination.total === 0 ? 0 : (page - 1) * pagination.pageSize + 1}
            {' '}-{' '}
            {Math.min(page * pagination.pageSize, pagination.total)} of {pagination.total}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="px-2 text-xs uppercase tracking-[0.18em] text-white/35">
              Page {page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              disabled={page === pagination.totalPages}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {editingAsset ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-900/80 px-6 backdrop-blur-sm">
          <div className="glass-card w-full max-w-3xl p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Edit Asset</h2>
                <p className="mt-1 text-sm text-white/45">
                  Update the record and keep the dashboard in sync.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60"
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
      ) : null}
    </div>
  )
}

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 text-left ${active ? 'text-white/80' : 'text-white/35'}`}
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
          <p className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</p>
          <p className="mt-3 text-2xl font-bold text-white">{value}</p>
          <p className="mt-2 text-xs text-white/45">{detail}</p>
        </div>
        {Icon ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-accent">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
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
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
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
