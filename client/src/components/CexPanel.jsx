import { useState } from 'react'
import {
  ArrowUpDown, ChevronDown, ChevronUp, Download, Eye, EyeOff,
  Loader2, AlertCircle, Sparkles,
} from 'lucide-react'
import { fetchCoinbaseBalances, fetchDemoBalances, createAsset } from '../services/api.js'
import { resolveCoinGeckoId } from '../../../shared/constants.js'

const USD_SGD = 1.35

function formatUsd(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

export default function CexPanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState('demo') // 'demo' | 'live'
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [balances, setBalances] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(new Set())

  async function handleConnect() {
    setLoading(true)
    setError('')
    try {
      let data
      if (mode === 'demo') {
        data = await fetchDemoBalances()
      } else {
        if (!apiKey || !apiSecret) {
          setError('Both API key and secret are required.')
          setLoading(false)
          return
        }
        data = await fetchCoinbaseBalances(apiKey, apiSecret)
      }
      setBalances(data.balances)
      setSource(data.source)
    } catch (err) {
      setError(err.message || 'Failed to fetch balances.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport(token) {
    const today = new Date().toISOString().split('T')[0]
    await createAsset({
      name: token.name || token.symbol,
      category: 'CRYPTO',
      ticker: token.coingeckoId || resolveCoinGeckoId(token.symbol),
      quantity: token.balance,
      value: Math.round((token.nativeValue || 0) * USD_SGD * 100) / 100,
      cost: 0,
      date: today,
      institution: source === 'demo' ? 'Coinbase (Demo)' : 'Coinbase',
      details: {
        subcategory: 'cex',
        exchange: 'coinbase',
        importedFrom: source || 'cex',
      },
    })
    setImported((prev) => new Set([...prev, token.symbol]))
    onImportDone?.()
  }

  async function handleImportAll() {
    if (!balances) return
    for (const token of balances) {
      if (!imported.has(token.symbol)) {
        await handleImport(token)
      }
    }
  }

  function handleDisconnect() {
    setBalances(null)
    setSource(null)
    setImported(new Set())
  }

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/25 to-indigo-500/15 flex items-center justify-center">
            <ArrowUpDown className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">Crypto Exchange</p>
            <p className="text-xs text-white/35">
              {balances ? `${balances.length} assets loaded from ${source}` : 'Connect Coinbase or try demo mode'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {!balances ? (
            <>
              {/* Mode toggle */}
              <div className="flex items-center gap-2 pt-4 pb-3">
                <button
                  onClick={() => setMode('demo')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    mode === 'demo'
                      ? 'border-blue-400/30 bg-blue-400/[0.08] text-blue-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/70'
                  }`}
                >
                  <Sparkles className="h-3 w-3 inline mr-1.5" />
                  Demo Mode
                </button>
                <button
                  onClick={() => setMode('live')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    mode === 'live'
                      ? 'border-blue-400/30 bg-blue-400/[0.08] text-blue-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/70'
                  }`}
                >
                  Coinbase API
                </button>
              </div>

              {mode === 'demo' && (
                <p className="text-xs text-white/30 mb-3">
                  Load a sample crypto portfolio for demonstration. No API keys needed.
                </p>
              )}

              {mode === 'live' && (
                <div className="space-y-2 mb-3">
                  <p className="text-xs text-white/30">
                    Enter your Coinbase read-only API key. Create one at Coinbase &gt; Settings &gt; API.
                  </p>
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API Key"
                    className="app-input w-full text-sm font-mono"
                  />
                  <div className="relative">
                    <input
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      type={showSecret ? 'text' : 'password'}
                      placeholder="API Secret"
                      className="app-input w-full text-sm font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    >
                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 transition-shadow disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpDown className="h-4 w-4" />}
                {mode === 'demo' ? 'Load Demo Portfolio' : 'Connect Coinbase'}
              </button>
            </>
          ) : (
            <>
              {/* Balance list */}
              <div className="pt-3 space-y-0">
                {balances.map((token) => {
                  const isDone = imported.has(token.symbol)
                  return (
                    <div key={token.symbol} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-blue-300">{token.symbol.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/90">{token.symbol}</p>
                          <p className="text-xs text-white/35 truncate">{token.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono text-white/70 tabular-nums">
                            {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </p>
                          <p className="text-xs text-white/30">{formatUsd(token.nativeValue)}</p>
                        </div>
                        {isDone ? (
                          <span className="text-xs text-emerald-400 font-medium w-14 text-center">Added</span>
                        ) : (
                          <button
                            onClick={() => handleImport(token)}
                            className="text-xs text-blue-300 border border-blue-400/20 bg-blue-400/8 rounded-lg px-2.5 py-1 hover:bg-blue-400/18 transition-colors w-14 text-center"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Import all + disconnect */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleImportAll}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/8 py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-400/15 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import All to Portfolio
                </button>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-white/40 hover:text-red-400 border border-white/[0.08] rounded-xl px-4 py-2.5 transition-colors"
                >
                  Disconnect
                </button>
              </div>

              {source === 'demo' && (
                <p className="text-[10px] text-white/20 text-center mt-3">
                  This is sample data for demonstration purposes.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
