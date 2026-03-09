import { useState, useRef } from 'react'
import {
  TrendingUp, ChevronDown, ChevronUp,
  Download, Upload, AlertCircle,
} from 'lucide-react'
import { createAsset } from '../services/api.js'

const USD_SGD = 1.35
const MOOMOO_COLOR = '#FF6D00'

function parseMoomooCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV appears empty.')

  const headerIdx = lines.findIndex(l =>
    /symbol/i.test(l) && (/qty|quantity|shares/i.test(l) || /cost|price/i.test(l))
  )
  if (headerIdx === -1)
    throw new Error('Could not find a valid header row. Export the Positions table from Moomoo.')

  const headers = lines[headerIdx].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
  const col = (names) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.includes(n))
      if (i !== -1) return i
    }
    return -1
  }

  const iSymbol  = col(['symbol', 'ticker', 'code'])
  const iName    = col(['name', 'description', 'security'])
  const iQty     = col(['qty', 'quantity', 'shares', 'position'])
  const iAvgCost = col(['avg cost', 'average cost', 'avg price', 'cost basis', 'cost/share'])
  const iMktVal  = col(['market value', 'mkt val', 'market val', 'value'])
  const iCcy     = col(['currency', 'ccy'])

  if (iSymbol === -1 || iQty === -1 || iMktVal === -1)
    throw new Error('Missing required columns (Symbol, Qty, Market Value). Export the Positions sheet from Moomoo.')

  const parse = (row, i) =>
    i === -1 ? null : row[i]?.replace(/"/g, '').replace(/[$,]/g, '').trim() || null

  const positions = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i].split(',')
    const symbol = parse(row, iSymbol)
    if (!symbol || /total|subtotal/i.test(symbol)) continue
    const qty = parseFloat(parse(row, iQty) || '0')
    const marketValue = parseFloat(parse(row, iMktVal) || '0')
    if (isNaN(qty) || isNaN(marketValue) || marketValue === 0) continue
    positions.push({
      symbol,
      name: parse(row, iName) || symbol,
      quantity: qty,
      avgCost: iAvgCost !== -1 ? parseFloat(parse(row, iAvgCost) || '0') : 0,
      marketValue,
      currency: parse(row, iCcy) || 'USD',
    })
  }

  if (positions.length === 0) throw new Error('No positions found in CSV.')
  return positions
}

export default function StockPortfolioPanel({ onImportDone }) {
  const [expanded, setExpanded]       = useState(true)
  const [positions, setPositions]     = useState(null)
  const [error, setError]             = useState('')
  const [importedIds, setImportedIds] = useState(new Set())
  const fileRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        setPositions(parseMoomooCsv(ev.target.result))
      } catch (err) {
        setError(err.message)
        setPositions(null)
      }
    }
    reader.readAsText(file)
  }

  function handleDisconnect() {
    setPositions(null)
    setImportedIds(new Set())
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function importPosition(pos) {
    if (importedIds.has(pos.symbol)) return
    const today = new Date().toISOString().split('T')[0]
    const sgdValue = pos.currency === 'USD'
      ? Math.round(pos.marketValue * USD_SGD * 100) / 100
      : Math.round(pos.marketValue * 100) / 100
    const sgdCost = pos.avgCost > 0 && pos.quantity > 0
      ? Math.round(pos.avgCost * pos.quantity * (pos.currency === 'USD' ? USD_SGD : 1) * 100) / 100
      : sgdValue
    await createAsset({
      name: pos.name || pos.symbol,
      category: 'STOCKS',
      ticker: pos.symbol,
      quantity: pos.quantity || null,
      value: sgdValue,
      cost: sgdCost,
      date: today,
      institution: 'Moomoo',
      details: {
        subcategory: 'brokerage',
        exchange: 'moomoo',
        currency: pos.currency,
        importedFrom: 'moomoo-csv',
      },
    })
    setImportedIds(prev => new Set([...prev, pos.symbol]))
    onImportDone?.()
  }

  const totalSgd = positions?.reduce((s, p) => {
    return s + (p.currency === 'USD' ? p.marketValue * USD_SGD : p.marketValue)
  }, 0) ?? 0

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: `${MOOMOO_COLOR}22` }}>
            <TrendingUp className="h-4 w-4" style={{ color: MOOMOO_COLOR }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">Stock Portfolio</p>
            <p className="text-xs text-white/35">
              {positions
                ? `${positions.length} position${positions.length !== 1 ? 's' : ''} · SGD ${totalSgd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : 'Import from Moomoo via CSV'}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">

          {/* Moomoo sub-panel */}
          <div className="pt-4">
            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: `${MOOMOO_COLOR}28`, background: `${MOOMOO_COLOR}06` }}>

              {/* Moomoo header row */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-bold"
                    style={{ background: `${MOOMOO_COLOR}22`, color: MOOMOO_COLOR }}>M</div>
                  <div>
                    <p className="text-sm font-semibold text-white/90">Moomoo</p>
                    <p className="text-xs text-white/35">
                      {positions
                        ? `${positions.length} position${positions.length !== 1 ? 's' : ''} loaded`
                        : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {positions ? (
                    <button
                      onClick={handleDisconnect}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/[0.07]"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <label
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ background: `${MOOMOO_COLOR}1a`, color: MOOMOO_COLOR, border: `1px solid ${MOOMOO_COLOR}35` }}
                    >
                      <Upload className="h-3 w-3" />
                      Upload CSV
                      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                    </label>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-5 py-3 text-xs text-red-400/80 bg-red-500/[0.04] border-b border-red-500/10">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {!positions && !error && (
                <div className="px-5 py-5 text-xs text-white/25 text-center">
                  Export from Moomoo app → Portfolio → Positions → Export CSV, then upload here.
                </div>
              )}

              {positions && (
                <div className="px-4 py-3">
                  {positions.map((pos) => {
                    const done = importedIds.has(pos.symbol)
                    const sgdVal = pos.currency === 'USD' ? pos.marketValue * USD_SGD : pos.marketValue
                    return (
                      <div key={pos.symbol} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-7 w-7 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-3.5 w-3.5" style={{ color: MOOMOO_COLOR }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white/90">{pos.symbol}</p>
                            <p className="text-xs text-white/35 truncate">{pos.name} · {pos.quantity} shares</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-mono text-white/80">
                              {pos.currency} {pos.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {pos.currency !== 'SGD' && (
                              <p className="text-xs text-white/30 font-mono">
                                ≈ SGD {sgdVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                            )}
                          </div>
                          {done ? (
                            <span className="text-xs text-emerald-400 font-medium w-14 text-right">Added ✓</span>
                          ) : (
                            <button
                              onClick={() => importPosition(pos)}
                              className="text-xs border rounded-lg px-2.5 py-1 transition-colors w-14 text-center"
                              style={{ color: MOOMOO_COLOR, borderColor: `${MOOMOO_COLOR}30`, background: `${MOOMOO_COLOR}10` }}
                            >
                              Import
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => Promise.all(positions.map(p => importPosition(p)))}
                    className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-colors"
                    style={{ border: `1px solid ${MOOMOO_COLOR}25`, background: `${MOOMOO_COLOR}10`, color: MOOMOO_COLOR }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Import All Positions
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
