import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Pencil, PlusCircle, RefreshCw, Search, Trash2, Wallet } from 'lucide-react'
import AssetForm from '../components/AssetForm'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { deleteAsset, fetchAssets, fetchPrices, refreshPrices, updateAsset } from '../services/api.js'
import { summarizeAssetDetails } from '../data/assetDetails.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

export default function Assets() {
  const [assets, setAssets] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [pricingFilter, setPricingFilter] = useState('ALL')

  async function loadAssets() {
    try {
      setLoading(true)
      setError('')
      const [assetRows, priceRows] = await Promise.all([fetchAssets(), fetchPrices()])
      setAssets(assetRows)
      setPrices(priceRows)
    } catch (err) {
      setError(err.message || 'Failed to load assets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase()

    return assets.filter((asset) => {
      const isLiveTracked = Boolean(asset.ticker && asset.quantity != null)
      const matchesCategory = categoryFilter === 'ALL' || asset.category === categoryFilter
      const matchesPricing = pricingFilter === 'ALL'
        || (pricingFilter === 'LIVE' && isLiveTracked)
        || (pricingFilter === 'MANUAL' && !isLiveTracked)
      const detailSummary = summarizeAssetDetails(asset).toLowerCase()
      const haystack = [
        asset.name,
        asset.ticker,
        asset.institution,
        ASSET_CATEGORIES[asset.category],
        detailSummary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !term || haystack.includes(term)

      return matchesCategory && matchesPricing && matchesSearch
    })
  }, [assets, categoryFilter, pricingFilter, search])

  const stats = useMemo(() => {
    const liveTracked = filteredAssets.filter((asset) => asset.ticker && asset.quantity != null).length
    const totalValue = filteredAssets.reduce((sum, asset) => sum + asset.value, 0)
    return {
      count: filteredAssets.length,
      liveTracked,
      manual: filteredAssets.length - liveTracked,
      totalValue,
    }
  }, [filteredAssets])

  const latestPriceTime = prices[0]?.updated_at
    ? new Date(prices[0].updated_at).toLocaleString('en-SG')
    : 'No live refresh yet'

  async function handleRefresh() {
    try {
      setIsRefreshing(true)
      setBanner('')
      await refreshPrices()
      await loadAssets()
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
      await loadAssets()
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
      await loadAssets()
      setBanner('Asset updated.')
    } catch (err) {
      setSubmitError(err.message || 'Update failed.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleExport() {
    const headers = ['Name', 'Category', 'Ticker', 'Institution', 'Value SGD', 'Cost SGD', 'Quantity', 'Date', 'Details']
    const rows = filteredAssets.map((asset) => [
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
        <StatCard label="Assets" value={stats.count} detail="Total records" icon={Wallet} />
        <StatCard label="Live Tracked" value={stats.liveTracked} detail="Ticker + quantity" icon={RefreshCw} />
        <StatCard label="Manual Assets" value={stats.manual} detail="Manual valuation" icon={Pencil} />
        <StatCard label="Portfolio Value" value={formatCurrency(stats.totalValue)} detail={`Last price sync: ${latestPriceTime}`} />
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

      {banner && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
          {banner}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-white/[0.06] px-6 py-4 text-xs uppercase tracking-[0.18em] text-white/35">
          <span>Asset</span>
          <span>Category</span>
          <span>Value</span>
          <span>Cost</span>
          <span>P&amp;L</span>
          <span>Actions</span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {filteredAssets.map((asset) => {
            const gainLoss = asset.value - asset.cost
            const gainLossPct = asset.cost > 0 ? (gainLoss / asset.cost) * 100 : 0
            const detailSummary = summarizeAssetDetails(asset)

            return (
              <div
                key={asset.id}
                className="grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-5 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium text-white">{asset.name}</div>
                  <div className="mt-1 text-xs text-white/40">
                    {asset.ticker || asset.institution || 'Manual asset'}
                    {asset.quantity != null ? ` • Qty ${asset.quantity}` : ''}
                  </div>
                  {detailSummary ? (
                    <div className="mt-1 text-xs text-white/30">{detailSummary}</div>
                  ) : null}
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
          {!filteredAssets.length ? (
            <div className="px-6 py-10 text-center text-sm text-white/45">
              No assets match the current search or filters.
            </div>
          ) : null}
        </div>
      </div>

      {editingAsset && (
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
      )}
    </div>
  )
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">{label}</p>
          <p className="mt-3 text-2xl font-bold text-white">{value}</p>
          <p className="mt-2 text-xs text-white/45">{detail}</p>
        </div>
        {Icon ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/55">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
