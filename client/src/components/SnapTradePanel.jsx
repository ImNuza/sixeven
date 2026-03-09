import { useState, useEffect } from 'react'
import {
  TrendingUp, ChevronDown, ChevronUp, Download,
  Loader2, AlertCircle, Sparkles, ExternalLink, RefreshCw, CheckCircle2,
} from 'lucide-react'
import {
  snaptradeRegister, snaptradeLogin,
  fetchSnaptradeHoldings, fetchSnaptradeDemoHoldings,
  createAsset,
} from '../services/api.js'

const USD_SGD = 1.35

function toSgd(value, currencyCode = 'USD') {
  if (currencyCode === 'SGD') return Math.round(value * 100) / 100
  return Math.round(value * USD_SGD * 100) / 100
}

function formatMoney(value, currencyCode = 'USD') {
  const symbol = currencyCode === 'SGD' ? 'S$' : 'US$'
  return symbol + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

// SnapTrade returns all position types as 'equity'; infer bonds from known ETFs
const BOND_TICKERS = new Set(['AGG', 'BND', 'TLT', 'LQD', 'HYG', 'MUB', 'SHY', 'IEF', 'TIP', 'VCIT', 'VCSH', 'BSV'])

function guessCategory(symbol = '', type = '') {
  const t = type.toUpperCase()
  if (t === 'BOND' || t === 'FIXED_INCOME') return 'BONDS'
  if (BOND_TICKERS.has(symbol.toUpperCase())) return 'BONDS'
  if (t === 'ETF' || t === 'MUTUAL_FUND') return 'STOCKS'
  if (t === 'EQUITY' || t === 'STOCK') return 'STOCKS'
  return 'STOCKS'
}

// Flatten SnapTrade holdings (array of account objects with positions arrays)
function flattenHoldings(holdingsData) {
  const flat = []
  for (const item of holdingsData) {
    const accountName = item.account?.institution_name || item.account?.name || 'Brokerage'
    for (const pos of item.positions || []) {
      const symbol = pos.symbol?.symbol || pos.ticker || ''
      const description = pos.symbol?.description || pos.symbol?.name || symbol
      const units = Number(pos.units ?? pos.quantity ?? 0)
      const price = Number(pos.price ?? 0)
      const marketValue = units * price
      const avgCost = Number(pos.average_purchase_price ?? pos.avg_cost ?? 0)
      const openPnl = Number(pos.open_pnl ?? pos.unrealized_pnl ?? 0)
      const currency = pos.currency?.code || pos.currency || 'USD'
      const type = pos.symbol?.type || pos.asset_class || 'equity'
      flat.push({ symbol, description, units, price, marketValue, avgCost, openPnl, currency, type, accountName })
    }
  }
  return flat
}

export default function SnapTradePanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState('connect') // 'connect' | 'demo'

  // Registration state
  const [registering, setRegistering] = useState(false)
  const [snapUserId, setSnapUserId] = useState(null)
  const [registered, setRegistered] = useState(false)

  // Broker connection state
  const [connecting, setConnecting] = useState(false)
  const [redirectOpened, setRedirectOpened] = useState(false)

  // Holdings state
  const [positions, setPositions] = useState(null)
  const [source, setSource] = useState(null)
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [imported, setImported] = useState(new Set())

  const [error, setError] = useState('')

  // Auto-register on mount (connect mode only)
  useEffect(() => {
    if (mode !== 'connect') return
    handleRegister()
  }, [mode])

  async function handleRegister() {
    setRegistering(true)
    setError('')
    try {
      const data = await snaptradeRegister()
      setSnapUserId(data.snapUserId)
      setRegistered(true)
    } catch (err) {
      setError('Registration failed: ' + (err.message || 'Unknown error'))
    } finally {
      setRegistering(false)
    }
  }

  async function handleConnectBroker() {
    setConnecting(true)
    setError('')
    try {
      const data = await snaptradeLogin()
      const uri = data.redirectURI
      if (!uri) throw new Error('No redirect URI returned from SnapTrade.')
      window.open(uri, '_blank', 'noopener,noreferrer')
      setRedirectOpened(true)
    } catch (err) {
      setError('Could not open broker connection: ' + (err.message || 'Unknown error'))
    } finally {
      setConnecting(false)
    }
  }

  async function handleFetchHoldings() {
    setLoadingHoldings(true)
    setError('')
    try {
      const data = await fetchSnaptradeHoldings()
      const flat = flattenHoldings(data.holdings || [])
      if (!flat.length) {
        setError('No positions found. Make sure you have connected a brokerage account and it holds positions.')
        setLoadingHoldings(false)
        return
      }
      setPositions(flat)
      setSource('snaptrade')
    } catch (err) {
      setError(err.message || 'Failed to fetch holdings.')
    } finally {
      setLoadingHoldings(false)
    }
  }

  async function handleLoadDemo() {
    setLoadingHoldings(true)
    setError('')
    try {
      const data = await fetchSnaptradeDemoHoldings()
      const flat = flattenHoldings(data.holdings || [])
      setPositions(flat)
      setSource('demo')
    } catch (err) {
      setError(err.message || 'Failed to load demo data.')
    } finally {
      setLoadingHoldings(false)
    }
  }

  async function handleImport(pos) {
    const today = new Date().toISOString().split('T')[0]
    const category = guessCategory(pos.symbol, pos.type)
    const marketValSgd = toSgd(pos.marketValue, pos.currency)
    const costSgd = pos.avgCost > 0
      ? toSgd(pos.avgCost * pos.units, pos.currency)
      : marketValSgd

    const payload = {
      name: pos.description || pos.symbol,
      category,
      value: marketValSgd,
      cost: costSgd,
      date: today,
      institution: source === 'demo' ? 'SnapTrade (Demo)' : (pos.accountName || 'SnapTrade'),
      details: { subcategory: 'brokerage', importedFrom: 'snaptrade', currency: pos.currency },
    }

    if (category === 'STOCKS' && pos.symbol) {
      payload.ticker = pos.symbol
      payload.quantity = pos.units
    }

    await createAsset(payload)
    setImported(prev => new Set([...prev, pos.symbol]))
    onImportDone?.()
  }

  async function handleImportAll() {
    if (!positions) return
    for (const pos of positions) {
      if (!imported.has(pos.symbol)) await handleImport(pos)
    }
  }

  function handleClear() {
    setPositions(null)
    setSource(null)
    setImported(new Set())
    setError('')
    setRedirectOpened(false)
  }

  function handleModeSwitch(newMode) {
    setMode(newMode)
    setError('')
    setPositions(null)
    setSource(null)
    setImported(new Set())
    setRedirectOpened(false)
    if (newMode === 'connect' && !registered) handleRegister()
  }

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/25 to-indigo-500/15 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">SnapTrade</p>
            <p className="text-xs text-white/35">
              {positions
                ? `${positions.length} positions loaded`
                : 'Connect any brokerage to import stocks & bonds'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {/* Mode tabs */}
          <div className="flex items-center gap-2 pt-4 pb-3">
            {[
              { id: 'connect', label: 'Connect Brokerage' },
              { id: 'demo', label: 'Demo', icon: Sparkles },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleModeSwitch(id)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                  mode === id
                    ? 'border-blue-400/30 bg-blue-400/[0.08] text-blue-300'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/70'
                }`}
              >
                {Icon && <Icon className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>

          {!positions ? (
            <>
              {mode === 'connect' && (
                <div className="space-y-3">
                  {/* Step 1 — Register */}
                  <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    registered
                      ? 'border-blue-400/20 bg-blue-400/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.01]'
                  }`}>
                    <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      registered ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-white/40'
                    }`}>
                      {registering
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : registered
                          ? <CheckCircle2 className="h-3 w-3" />
                          : '1'}
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${registered ? 'text-white/80' : 'text-white/40'}`}>
                        {registering ? 'Setting up your SnapTrade account…' : registered ? 'Account ready' : 'Set up SnapTrade account'}
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5">Happens automatically when you open this panel.</p>
                    </div>
                  </div>

                  {/* Step 2 — Connect broker */}
                  <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    redirectOpened
                      ? 'border-blue-400/20 bg-blue-400/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.01]'
                  }`}>
                    <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      redirectOpened ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-white/40'
                    }`}>
                      {redirectOpened ? <CheckCircle2 className="h-3 w-3" /> : '2'}
                    </div>
                    <div className="flex-1">
                      <p className={`text-xs font-medium ${registered ? 'text-white/80' : 'text-white/30'}`}>
                        {redirectOpened ? 'Broker connection opened' : 'Connect your brokerage'}
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        Opens a secure SnapTrade portal. Log in and link your broker account.
                      </p>
                      <button
                        onClick={handleConnectBroker}
                        disabled={!registered || connecting}
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-500/15 border border-blue-400/20 px-4 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {connecting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ExternalLink className="h-3.5 w-3.5" />}
                        {redirectOpened ? 'Re-open Broker Portal' : 'Open Broker Portal'}
                      </button>
                    </div>
                  </div>

                  {/* Step 3 — Fetch holdings */}
                  <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.01] px-4 py-3">
                    <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      redirectOpened ? 'bg-white/10 text-white/50' : 'bg-white/[0.05] text-white/25'
                    }`}>
                      3
                    </div>
                    <div className="flex-1">
                      <p className={`text-xs font-medium ${redirectOpened ? 'text-white/80' : 'text-white/30'}`}>
                        Fetch your portfolio
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        After linking your broker, click below to load your positions.
                      </p>
                      <button
                        onClick={handleFetchHoldings}
                        disabled={!redirectOpened || loadingHoldings}
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:shadow-blue-500/35 transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {loadingHoldings
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />}
                        Fetch Holdings
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'demo' && (
                <div className="space-y-3 mb-3">
                  <p className="text-xs text-white/30">
                    Load a sample SnapTrade portfolio (stocks + bonds) for demonstration. No broker credentials needed.
                  </p>
                  <button
                    onClick={handleLoadDemo}
                    disabled={loadingHoldings}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 transition-shadow disabled:opacity-50"
                  >
                    {loadingHoldings ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    Load Demo Portfolio
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mt-3">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="pt-3">
                {positions.map((pos, idx) => {
                  const isDone = imported.has(pos.symbol)
                  const pnlColor = pos.openPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  const category = guessCategory(pos.symbol, pos.type)
                  return (
                    <div key={`${pos.symbol}-${idx}`} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-blue-300">{pos.symbol.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-white/90">{pos.symbol}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              category === 'BONDS'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-blue-500/15 text-blue-300'
                            }`}>{category}</span>
                          </div>
                          <p className="text-xs text-white/35 truncate">{pos.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono text-white/70 tabular-nums">
                            {pos.units.toLocaleString(undefined, { maximumFractionDigits: 4 })} units
                          </p>
                          <p className={`text-xs font-mono tabular-nums ${pnlColor}`}>
                            {formatMoney(pos.marketValue, pos.currency)}
                            {pos.openPnl !== 0 && (
                              <span className="text-white/30 ml-1">
                                ({pos.openPnl >= 0 ? '+' : ''}{formatMoney(Math.abs(pos.openPnl), pos.currency)})
                              </span>
                            )}
                          </p>
                        </div>
                        {isDone ? (
                          <span className="text-xs text-blue-400 font-medium w-14 text-center">Added</span>
                        ) : (
                          <button
                            onClick={() => handleImport(pos)}
                            className="text-xs text-blue-300 border border-blue-400/20 bg-blue-400/[0.08] rounded-lg px-2.5 py-1 hover:bg-blue-400/[0.18] transition-colors w-14 text-center"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mt-3">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleImportAll}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/[0.08] py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-400/15 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import All to Portfolio
                </button>
                <button
                  onClick={handleClear}
                  className="text-xs text-white/40 hover:text-red-400 border border-white/[0.08] rounded-xl px-4 py-2.5 transition-colors"
                >
                  Clear
                </button>
              </div>

              {source === 'demo' && (
                <p className="text-[10px] text-white/20 text-center mt-3">Sample data for demonstration purposes.</p>
              )}
              {source === 'snaptrade' && (
                <p className="text-[10px] text-white/25 text-center mt-3">Live data from your connected brokerage via SnapTrade.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
