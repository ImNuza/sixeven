import { useState, useRef } from 'react'
import {
  TrendingUp, ChevronDown, ChevronUp, Download,
  Loader2, AlertCircle, Sparkles, FileText, Info,
} from 'lucide-react'
import { fetchMomooDemoPositions, createAsset } from '../services/api.js'

const USD_SGD = 1.35

function formatValue(value, currency) {
  const symbol = currency === 'SGD' ? 'S$' : 'US$'
  return symbol + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

/**
 * Parse a moomoo CSV export.
 * moomoo's export headers vary by app version/language, so we try several aliases.
 */
function parseMomooCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('CSV appears empty.')

  // Find the header row (first non-empty line)
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())

  const col = (aliases) => {
    for (const alias of aliases) {
      const idx = rawHeaders.indexOf(alias)
      if (idx !== -1) return idx
    }
    return -1
  }

  const codeIdx    = col(['stock code', 'code', 'symbol', 'ticker'])
  const nameIdx    = col(['stock name', 'name', 'security name', 'description'])
  const qtyIdx     = col(['quantity', 'qty', 'holdings', 'shares', 'position'])
  const costIdx    = col(['average cost', 'avg cost', 'cost price', 'avg. cost', 'average cost price'])
  const priceIdx   = col(['current price', 'market price', 'last price', 'price', 'latest price'])
  const valueIdx   = col(['market value', 'mkt value', 'market val', 'value'])
  const pnlIdx     = col(['unrealized p/l', 'unrealised p/l', 'p/l', 'profit/loss', 'unrealized profit/loss', 'unrealised profit/loss', 'pnl'])
  const currIdx    = col(['currency', 'ccy'])

  if (codeIdx === -1) throw new Error('Could not find a stock code column. Make sure you export the Positions view from moomoo.')

  const positions = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Handle quoted fields with commas inside
    const cells = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || line.split(',').map(c => c.trim())

    const code    = cells[codeIdx] || ''
    const name    = nameIdx  >= 0 ? cells[nameIdx]  || '' : code
    const qty     = parseFloat(cells[qtyIdx]   || 0)
    const cost    = parseFloat(cells[costIdx]  || 0)
    const price   = parseFloat(cells[priceIdx] || 0)
    const value   = valueIdx >= 0 ? parseFloat(cells[valueIdx] || 0) : price * qty
    const pnl     = pnlIdx   >= 0 ? parseFloat(cells[pnlIdx]  || 0) : value - cost * qty
    const currency = currIdx >= 0 ? cells[currIdx] || inferCurrency(code) : inferCurrency(code)

    if (!code || isNaN(qty) || qty <= 0) continue

    positions.push({
      code,
      ticker: normalizeTicker(code),
      name,
      assetClass: 'STK',
      quantity: qty,
      marketPrice: price,
      marketValue: value || price * qty,
      currency,
      avgCost: cost,
      unrealizedPnl: pnl,
    })
  }

  if (!positions.length) throw new Error('No valid positions found in the CSV. Check the file format.')
  return positions
}

function inferCurrency(code) {
  if (code.endsWith('.SI')) return 'SGD'
  if (code.endsWith('.HK')) return 'HKD'
  return 'USD'
}

function normalizeTicker(code) {
  if (!code) return ''
  if (code.endsWith('.SI')) return code
  if (code.endsWith('.HK')) return code.replace(/^(\d+)\.HK$/, (_, n) => n.padStart(4, '0') + '.HK')
  if (code.endsWith('.US')) return code.replace('.US', '')
  return code
}

export default function MoomooPanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState('csv') // 'csv' | 'demo'
  const [positions, setPositions] = useState(null)
  const [accountId, setAccountId] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(new Set())
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  function handleCsvFile(file) {
    if (!file) return
    setError('')
    setLoading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseMomooCsv(e.target.result)
        setPositions(parsed)
        setAccountId('Your Account')
        setSource('csv')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file.')
      setLoading(false)
    }
    reader.readAsText(file)
  }

  function handleFileInput(e) {
    handleCsvFile(e.target.files?.[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleCsvFile(e.dataTransfer.files?.[0])
  }

  async function handleLoadDemo() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchMomooDemoPositions()
      setPositions(data.positions)
      setAccountId(data.accountId)
      setSource(data.source)
    } catch (err) {
      setError(err.message || 'Failed to load demo data.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport(position) {
    const today = new Date().toISOString().split('T')[0]
    const isSgd = position.currency === 'SGD'
    const toSgd = (v) => isSgd ? Math.round(v * 100) / 100 : Math.round(v * USD_SGD * 100) / 100
    const marketValueSgd = toSgd(position.marketValue)
    const costSgd = toSgd(position.avgCost * position.quantity)

    await createAsset({
      name: position.name || position.ticker,
      category: 'STOCKS',
      ticker: position.ticker,
      quantity: position.quantity,
      value: marketValueSgd,
      cost: costSgd > 0 ? costSgd : marketValueSgd,
      date: today,
      institution: source === 'demo' ? 'moomoo SG (Demo)' : 'moomoo SG',
      details: {
        subcategory: 'brokerage',
        importedFrom: 'moomoo',
        currency: position.currency,
        originalCode: position.code,
      },
    })
    setImported(prev => new Set([...prev, position.code]))
    onImportDone?.()
  }

  async function handleImportAll() {
    if (!positions) return
    for (const pos of positions) {
      if (!imported.has(pos.code)) await handleImport(pos)
    }
  }

  function handleDisconnect() {
    setPositions(null)
    setAccountId(null)
    setSource(null)
    setImported(new Set())
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-500/15 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-orange-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">moomoo Singapore</p>
            <p className="text-xs text-white/35">
              {positions
                ? `${positions.length} positions loaded${accountId ? ' — ' + accountId : ''}`
                : 'Import your moomoo SG brokerage portfolio'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {!positions ? (
            <>
              {/* Mode tabs */}
              <div className="flex items-center gap-2 pt-4 pb-3">
                {[
                  { id: 'csv',  label: 'CSV Export' },
                  { id: 'demo', label: 'Demo', icon: Sparkles },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setMode(id); setError('') }}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                      mode === id
                        ? 'border-orange-400/30 bg-orange-400/[0.08] text-orange-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/70'
                    }`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>

              {/* ── CSV mode ── */}
              {mode === 'csv' && (
                <div className="space-y-3 mb-3">
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.08] px-3 py-2.5 space-y-3">
                    <div className="flex gap-2">
                      <Info className="h-3.5 w-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-black/60 leading-relaxed space-y-0.5">
<p>1. Click <span className="text-black/80">Accounts</span> in the left sidebar</p>
                        <p>2. Click your account (e.g. Margin Account)</p>
                        <p>3. Click the <span className="text-black/80">Positions</span> tab</p>
                        <p>4. Click the <span className="text-black/80">↑ export icon</span> (right of the search bar)</p>
                        <p>5. Save the file and upload it below</p>
                      </div>
                    </div>
                  </div>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`cursor-pointer flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-6 transition-colors ${
                      dragOver
                        ? 'border-orange-400/50 bg-orange-400/[0.06]'
                        : 'border-white/[0.10] bg-white/[0.01] hover:border-orange-400/30 hover:bg-orange-400/[0.03]'
                    }`}
                  >
                    {loading
                      ? <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
                      : <FileText className="h-6 w-6 text-white/30" />}
                    <p className="text-xs text-white/40">
                      {loading ? 'Reading file…' : 'Drop your moomoo CSV here, or click to browse'}
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>
                </div>
              )}

              {/* ── Demo mode ── */}
              {mode === 'demo' && (
                <p className="text-xs text-white/30 mb-3">
                  Load a sample moomoo SG portfolio with SGX and US stocks. No credentials needed.
                </p>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'demo' && (
                <button
                  onClick={handleLoadDemo}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/20 hover:shadow-orange-500/35 transition-shadow disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  Load Demo Portfolio
                </button>
              )}
            </>
          ) : (
            <>
              {/* Positions list */}
              <div className="pt-3">
                {positions.map(pos => {
                  const isDone = imported.has(pos.code)
                  const pnlColor = pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  return (
                    <div key={pos.code} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-orange-300">
                            {pos.ticker.replace(/\.(SI|HK|US)$/, '').slice(0, 3)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/90">{pos.ticker}</p>
                          <p className="text-xs text-white/35 truncate">{pos.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono text-white/70 tabular-nums">
                            {pos.quantity.toLocaleString()} shares
                          </p>
                          <p className={`text-xs font-mono tabular-nums ${pnlColor}`}>
                            {formatValue(pos.marketValue, pos.currency)}
                            {pos.unrealizedPnl !== 0 && (
                              <span className="text-white/30 ml-1">
                                ({pos.unrealizedPnl >= 0 ? '+' : ''}{formatValue(Math.abs(pos.unrealizedPnl), pos.currency)})
                              </span>
                            )}
                          </p>
                        </div>
                        {isDone ? (
                          <span className="text-xs text-emerald-400 font-medium w-14 text-center">Added</span>
                        ) : (
                          <button
                            onClick={() => handleImport(pos)}
                            className="text-xs text-orange-300 border border-orange-400/20 bg-orange-400/[0.08] rounded-lg px-2.5 py-1 hover:bg-orange-400/[0.18] transition-colors w-14 text-center"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleImportAll}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-orange-400/20 bg-orange-400/[0.08] py-2.5 text-xs font-semibold text-orange-300 hover:bg-orange-400/15 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import All to Portfolio
                </button>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-white/40 hover:text-red-400 border border-white/[0.08] rounded-xl px-4 py-2.5 transition-colors"
                >
                  Clear
                </button>
              </div>

              {source === 'demo' && (
                <p className="text-[10px] text-white/20 text-center mt-3">Sample data for demonstration purposes.</p>
              )}
              {source === 'csv' && (
                <p className="text-[10px] text-white/25 text-center mt-3">Imported from your moomoo CSV export.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
