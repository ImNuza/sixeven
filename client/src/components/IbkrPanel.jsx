import { useState, useRef } from 'react'
import {
  BarChart2, ChevronDown, ChevronUp, Download,
  Loader2, AlertCircle, Sparkles, FileText, Info,
} from 'lucide-react'
import { fetchIbkrDemoPositions, createAsset } from '../services/api.js'

const USD_SGD = 1.35

function mapCategory(assetClass = 'STK') {
  const map = { STK: 'STOCKS', BOND: 'BONDS', CASH: 'CASH', OPT: 'OTHER', FUT: 'OTHER' }
  return map[String(assetClass).toUpperCase()] || 'OTHER'
}

function toSgd(value, currency) {
  if (currency === 'SGD') return Math.round(value * 100) / 100
  return Math.round(value * USD_SGD * 100) / 100
}

function formatDisplay(value, currency = 'USD') {
  const symbol = currency === 'SGD' ? 'S$' : 'US$'
  return symbol + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

/**
 * Parse an IBKR portfolio CSV export.
 *
 * IBKR exports can come from:
 *  - Client Portal → Portfolio → Export (simple grid CSV)
 *  - TWS → File → Save Portfolio (similar format)
 *  - Flex Query / Activity Statement (more complex, multi-section)
 *
 * We handle the common single-table format. Headers vary slightly by version.
 */
function parseIbkrCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('CSV appears empty.')

  // Find the header row — IBKR Flex exports have section headers like "Positions,Header,..."
  // We look for the first row that contains recognisable column names.
  let headerIdx = 0
  let rawHeaders = []
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = splitCsvLine(lines[i]).map(h => h.toLowerCase().trim())
    if (cols.some(c => ['symbol', 'ticker', 'ticker symbol'].includes(c))) {
      headerIdx = i
      rawHeaders = cols
      break
    }
  }
  if (!rawHeaders.length) throw new Error('Could not find a Symbol column. Make sure you export the Positions view from IBKR.')

  const col = (...aliases) => {
    for (const alias of aliases) {
      const idx = rawHeaders.indexOf(alias)
      if (idx !== -1) return idx
    }
    return -1
  }

  const symIdx   = col('symbol', 'ticker', 'ticker symbol', 'contract')
  const nameIdx  = col('description', 'security description', 'name', 'long name')
  const qtyIdx   = col('quantity', 'qty', 'position', 'shares')
  const costIdx  = col('average price', 'avg price', 'average cost', 'cost price', 'avg. price', 'cost basis price')
  const priceIdx = col('mark price', 'close price', 'last price', 'current price', 'price', 'closing price')
  const valueIdx = col('position value', 'market value', 'value', 'mkt value')
  const pnlIdx   = col('unrealized p&l', 'unrealized p/l', 'unrealised p&l', 'unrealised p/l', 'unrealized gain/loss', 'open trade equity')
  const currIdx  = col('currency', 'ccy')
  const typeIdx  = col('asset class', 'asset type', 'type', 'instrument type', 'sectype')

  if (symIdx === -1) throw new Error('Could not find a Symbol column. Make sure you export from IBKR Portfolio view.')

  const positions = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = splitCsvLine(line)

    // Skip Flex Query section/summary rows (they start with a section keyword)
    const firstCell = (cells[0] || '').toLowerCase()
    if (['positions', 'total', 'subtotal', 'header', 'data'].includes(firstCell)) continue

    const ticker   = cells[symIdx]?.trim() || ''
    if (!ticker || ticker.toLowerCase() === 'symbol') continue

    const qty      = parseFloat(cells[qtyIdx]  ?? 0) || 0
    const cost     = parseFloat(cells[costIdx] ?? 0) || 0
    const price    = parseFloat(cells[priceIdx] ?? 0) || 0
    const value    = valueIdx >= 0 ? parseFloat(cells[valueIdx] ?? 0) || price * qty : price * qty
    const pnl      = pnlIdx   >= 0 ? parseFloat(cells[pnlIdx]  ?? 0) || 0 : 0
    const currency = currIdx  >= 0 ? cells[currIdx]?.trim() || 'USD' : 'USD'
    const assetClass = typeIdx >= 0 ? cells[typeIdx]?.trim() || 'STK' : 'STK'
    const name     = nameIdx  >= 0 ? cells[nameIdx]?.trim() || ticker : ticker

    if (!ticker || isNaN(qty) || qty === 0) continue

    positions.push({
      ticker,
      name,
      assetClass,
      quantity: Math.abs(qty),
      marketPrice: price,
      marketValue: Math.abs(value),
      currency,
      avgCost: cost,
      unrealizedPnl: pnl,
    })
  }

  if (!positions.length) throw new Error('No valid positions found. Check that the file is an IBKR portfolio export.')
  return positions
}

function splitCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result.map(c => c.trim())
}

export default function IbkrPanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState('csv') // 'csv' | 'demo'
  const [positions, setPositions] = useState(null)
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
        const parsed = parseIbkrCsv(e.target.result)
        setPositions(parsed)
        setSource('csv')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    reader.onerror = () => { setError('Failed to read file.'); setLoading(false) }
    reader.readAsText(file)
  }

  function handleFileInput(e) { handleCsvFile(e.target.files?.[0]) }
  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    handleCsvFile(e.dataTransfer.files?.[0])
  }

  async function handleLoadDemo() {
    setLoading(true); setError('')
    try {
      const data = await fetchIbkrDemoPositions()
      setPositions(data.positions)
      setSource('demo')
    } catch (err) {
      setError(err.message || 'Failed to load demo data.')
    } finally { setLoading(false) }
  }

  async function handleImport(position) {
    const today = new Date().toISOString().split('T')[0]
    const category = mapCategory(position.assetClass)
    const isLivePriced = category === 'STOCKS'
    const marketValSgd = toSgd(position.marketValue, position.currency)
    const costSgd = toSgd(position.avgCost * position.quantity, position.currency)

    const payload = {
      name: position.name || position.ticker,
      category,
      value: marketValSgd,
      cost: costSgd > 0 ? costSgd : marketValSgd,
      date: today,
      institution: source === 'demo' ? 'Interactive Brokers (Demo)' : 'Interactive Brokers',
      details: { subcategory: 'brokerage', importedFrom: 'ibkr', currency: position.currency },
    }
    if (isLivePriced && position.ticker) {
      payload.ticker = position.ticker
      payload.quantity = position.quantity
    }

    await createAsset(payload)
    setImported(prev => new Set([...prev, position.ticker]))
    onImportDone?.()
  }

  async function handleImportAll() {
    if (!positions) return
    for (const pos of positions) {
      if (!imported.has(pos.ticker)) await handleImport(pos)
    }
  }

  function handleClear() {
    setPositions(null); setSource(null); setImported(new Set()); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/15 flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">Interactive Brokers</p>
            <p className="text-xs text-white/35">
              {positions ? `${positions.length} positions loaded` : 'Import your IBKR brokerage portfolio'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {!positions ? (
            <>
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
                        ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/70'
                    }`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'csv' && (
                <div className="space-y-3 mb-3">
                  <div className="flex gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2.5">
                    <Info className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-white/45 leading-relaxed space-y-0.5">
                      <p className="text-white/65 font-medium">How to export from IBKR:</p>
                      <p>1. Log in to <span className="text-white/60">Client Portal</span> (clientportal.ibkr.com)</p>
                      <p>2. Go to <span className="text-white/60">Portfolio</span></p>
                      <p>3. Click the <span className="text-white/60">Export</span> / download icon</p>
                      <p>4. Save as <span className="font-mono text-emerald-300">.csv</span> and upload below</p>
                      <p className="text-white/30 pt-0.5">Also works with TWS → File → Save Portfolio</p>
                    </div>
                  </div>

                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`cursor-pointer flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-6 transition-colors ${
                      dragOver
                        ? 'border-emerald-400/50 bg-emerald-400/[0.06]'
                        : 'border-white/[0.10] bg-white/[0.01] hover:border-emerald-400/30 hover:bg-emerald-400/[0.03]'
                    }`}
                  >
                    {loading
                      ? <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
                      : <FileText className="h-6 w-6 text-white/30" />}
                    <p className="text-xs text-white/40">
                      {loading ? 'Reading file…' : 'Drop your IBKR CSV here, or click to browse'}
                    </p>
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileInput} />
                  </div>
                </div>
              )}

              {mode === 'demo' && (
                <p className="text-xs text-white/30 mb-3">
                  Load a sample IBKR portfolio for demonstration. No credentials needed.
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
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-shadow disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
                  Load Demo Portfolio
                </button>
              )}
            </>
          ) : (
            <>
              <div className="pt-3">
                {positions.map(pos => {
                  const isDone = imported.has(pos.ticker)
                  const pnlColor = pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  return (
                    <div key={pos.ticker} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-emerald-300">{pos.ticker.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/90">{pos.ticker}</p>
                          <p className="text-xs text-white/35 truncate">{pos.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono text-white/70 tabular-nums">
                            {pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                          </p>
                          <p className={`text-xs font-mono tabular-nums ${pnlColor}`}>
                            {formatDisplay(pos.marketValue, pos.currency)}
                            {pos.unrealizedPnl !== 0 && (
                              <span className="text-white/30 ml-1">
                                ({pos.unrealizedPnl >= 0 ? '+' : ''}{formatDisplay(Math.abs(pos.unrealizedPnl), pos.currency)})
                              </span>
                            )}
                          </p>
                        </div>
                        {isDone ? (
                          <span className="text-xs text-emerald-400 font-medium w-14 text-center">Added</span>
                        ) : (
                          <button
                            onClick={() => handleImport(pos)}
                            className="text-xs text-emerald-300 border border-emerald-400/20 bg-emerald-400/[0.08] rounded-lg px-2.5 py-1 hover:bg-emerald-400/[0.18] transition-colors w-14 text-center"
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
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/15 transition-colors"
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
              {source === 'csv' && (
                <p className="text-[10px] text-white/25 text-center mt-3">Imported from your IBKR portfolio export.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
