import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  X, Wallet, Loader2, AlertCircle, CheckCircle2,
  Building2, TrendingUp, Coins, Banknote, Landmark, Package,
  Search,
} from 'lucide-react'
import { createAsset, lookupPrice, lookupPropertyByPostcode, lookupExchangeRate } from '../services/api.js'

const today = new Date().toISOString().split('T')[0]

const TABS = [
  { key: 'cash',     label: 'Cash / Bank',    icon: Banknote,   category: 'CASH' },
  { key: 'stocks',   label: 'Stocks / ETFs',  icon: TrendingUp, category: 'STOCKS' },
  { key: 'cpf',      label: 'CPF',            icon: Landmark,   category: 'CPF' },
  { key: 'property', label: 'Property',       icon: Building2,  category: 'PROPERTY' },
  { key: 'crypto',   label: 'Crypto',         icon: Coins,      category: 'CRYPTO' },
  { key: 'other',    label: 'Other',          icon: Package,    category: 'OTHER' },
]

const LIQUIDITY = {
  CASH: 'Liquid', STOCKS: 'Liquid', CRYPTO: 'Liquid',
  BONDS: 'Medium', FOREX: 'Liquid', PROPERTY: 'Illiquid', CPF: 'Illiquid', OTHER: 'Medium',
}

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'HKD', 'AUD', 'JPY', 'CNY']
const DEFAULT_FX = { SGD: 1, USD: 1.35, EUR: 1.47, GBP: 1.71, HKD: 0.17, AUD: 0.88, JPY: 0.009, CNY: 0.19 }

function formatSGD(v) {
  if (!v || isNaN(v) || !isFinite(v)) return '—'
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(v)
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{label}</span>
        {hint && <span className="text-[11px] text-white/25">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function Input({ value, onChange, placeholder, type = 'text', step, min, className = '' }) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} step={step} min={min}
      className={`app-input mt-0 text-sm w-full ${className}`}
    />
  )
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="app-input mt-0 text-sm w-full"
    >
      {children}
    </select>
  )
}

function FetchButton({ onClick, loading, label = 'Fetch Price' }) {
  return (
    <button
      type="button" onClick={onClick} disabled={loading}
      className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/[0.15] transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
      {loading ? 'Fetching…' : label}
    </button>
  )
}

// ── Cash / Bank ──────────────────────────────────────────────
function CashForm({ state, set }) {
  const [fetching, setFetching] = useState(false)
  const fx = parseFloat(state.fxRate) || DEFAULT_FX[state.currency] || 1
  const value = (parseFloat(state.balance) || 0) * fx

  async function handleCurrencyChange(c) {
    set({ ...state, currency: c, fxRate: String(DEFAULT_FX[c] ?? 1) })
    
    if (c === 'SGD') {
      // SGD to SGD = 1, no conversion needed
      return
    }
    
    // Fetch real FX rate asynchronously
    setFetching(true)
    try {
      console.log(`[CashForm] Fetching real FX rate for ${c}/SGD...`)
      const rate = await lookupExchangeRate(c, 'SGD')
      console.log(`[CashForm] Got rate: ${rate}`)
      set(current => ({ ...current, fxRate: String(rate) }))
    } catch (err) {
      console.warn(`[CashForm] Failed to fetch rate, using fallback:`, err.message)
      // Keep the fallback rate that was already set
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Institution">
          <Input value={state.institution} onChange={v => set({ ...state, institution: v })} placeholder="e.g. DBS, OCBC, UOB" />
        </Field>
        <Field label="Account Type">
          <Select value={state.accountType} onChange={v => set({ ...state, accountType: v })}>
            {['Savings', 'Current', 'Fixed Deposit', 'Money Market', 'Joint', 'Other'].map(t => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Balance">
        <Input type="number" step="0.01" min="0" value={state.balance} onChange={v => set({ ...state, balance: v })} placeholder="e.g. 25000" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency">
          <Select value={state.currency} onChange={handleCurrencyChange}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="FX Rate to SGD" hint={state.currency === 'SGD' ? 'No conversion' : fetching ? 'Fetching...' : ''}>
          <Input type="number" step="0.0001" value={state.fxRate} onChange={v => set({ ...state, fxRate: v })}
            placeholder="1.35" className={state.currency === 'SGD' ? 'opacity-40' : ''} />
        </Field>
      </div>
      <PreviewResult value={value} label="Deposit Value (SGD)" />
    </div>
  )
}

// ── Stocks / ETFs ────────────────────────────────────────────
function StocksForm({ state, set }) {
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [fetchOk, setFetchOk] = useState(false)

  const priceSgd = parseFloat(state.priceSgd) || 0
  const qty = parseFloat(state.quantity) || 0
  const costPerUnit = parseFloat(state.costBasis) || 0
  const fxRate = parseFloat(state.fxRate) || 1.35
  const value = qty * priceSgd
  const cost = costPerUnit > 0 ? qty * costPerUnit * fxRate : value

  async function handleFetch() {
    if (!state.ticker.trim()) return
    setFetching(true); setFetchMsg(''); setFetchOk(false)
    try {
      const data = await lookupPrice(state.ticker.trim(), 'stock')
      set({
        ...state,
        name: data.name || state.ticker,
        priceSgd: String(data.priceSgd?.toFixed(4) || ''),
        currency: data.currency || 'USD',
        fxRate: String(data.usdSgd?.toFixed(4) || '1.35'),
      })
      setFetchMsg(`Live: ${data.currency || 'USD'} ${data.price?.toFixed(2)} → S$${data.priceSgd?.toFixed(2)}`)
      setFetchOk(true)
    } catch (err) {
      setFetchMsg(err.message || 'Symbol not found.')
    } finally { setFetching(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Ticker Symbol" hint="e.g. AAPL, ES3.SI, MSFT">
          <Input value={state.ticker} onChange={v => set({ ...state, ticker: v.toUpperCase() })} placeholder="AAPL" />
        </Field>
        <FetchButton onClick={handleFetch} loading={fetching} />
      </div>
      {fetchMsg && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${fetchOk ? 'bg-emerald-400/[0.08] text-emerald-300' : 'bg-red-400/[0.08] text-red-300'}`}>
          {fetchOk ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
          {fetchMsg}
        </div>
      )}
      <Field label="Asset Name">
        <Input value={state.name} onChange={v => set({ ...state, name: v })} placeholder="e.g. Apple Inc." />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity (Shares)">
          <Input type="number" step="any" min="0" value={state.quantity} onChange={v => set({ ...state, quantity: v })} placeholder="e.g. 100" />
        </Field>
        <Field label="Current Price (SGD)" hint="Auto-filled from market">
          <Input type="number" step="any" min="0" value={state.priceSgd} onChange={v => set({ ...state, priceSgd: v })} placeholder="e.g. 255.75" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Brokerage">
          <Input value={state.brokerage} onChange={v => set({ ...state, brokerage: v })} placeholder="e.g. Tiger Brokers, moomoo" />
        </Field>
        <Field label="Purchase Date">
          <Input type="date" value={state.purchaseDate} onChange={v => set({ ...state, purchaseDate: v })} />
        </Field>
      </div>
      <Field label="Cost Basis per Unit (original currency)" hint="Optional — for P&L tracking">
        <Input type="number" step="any" min="0" value={state.costBasis} onChange={v => set({ ...state, costBasis: v })} placeholder="e.g. 180.00 USD" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <PreviewResult value={value} label="Position Value (SGD)" />
        {cost > 0 && cost !== value && (
          <PreviewResult value={value - cost} label="Unrealised P&L" positive={value >= cost} />
        )}
      </div>
    </div>
  )
}

// ── CPF ──────────────────────────────────────────────────────
const CPF_RATES = { OA: 0.025, SA: 0.04, MA: 0.04 }

function CPFForm({ state, set }) {
  const oa = parseFloat(state.oa) || 0
  const sa = parseFloat(state.sa) || 0
  const ma = parseFloat(state.ma) || 0
  const total = oa + sa + ma
  const FRS = 213000
  const saProgress = Math.min(100, (sa / FRS) * 100)

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/35 leading-relaxed">
        CPF balances earn guaranteed interest: OA 2.5% p.a., SA & MA 4% p.a. Your CPF is counted as an asset at current balance.
      </p>
      <Field label="Account Type">
        <Select value={state.accountType || 'OA'} onChange={v => set({ ...state, accountType: v })}>
          <option value="OA">Ordinary Account (OA)</option>
          <option value="SA">Special Account (SA)</option>
          <option value="MA">Medisave Account (MA)</option>
          <option value="RA">Retirement Account (RA)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Ordinary (OA)">
          <Input type="number" step="0.01" min="0" value={state.oa} onChange={v => set({ ...state, oa: v })} placeholder="0" />
        </Field>
        <Field label="Special (SA)">
          <Input type="number" step="0.01" min="0" value={state.sa} onChange={v => set({ ...state, sa: v })} placeholder="0" />
        </Field>
        <Field label="Medisave (MA)">
          <Input type="number" step="0.01" min="0" value={state.ma} onChange={v => set({ ...state, ma: v })} placeholder="0" />
        </Field>
      </div>
      <Field label="Monthly Contribution (optional)" hint="For future planning">
        <Input type="number" step="1" min="0" value={state.monthly} onChange={v => set({ ...state, monthly: v })} placeholder="e.g. 1850" />
      </Field>
      {total > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">SA vs Full Retirement Sum (S${(FRS / 1000).toFixed(0)}k)</span>
            <span className="text-xs font-mono text-white/50">{saProgress.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-cyan-400/60" style={{ width: `${saProgress}%` }} />
          </div>
          {sa < FRS && (
            <p className="text-xs text-amber-400">SA shortfall vs FRS: {formatSGD(FRS - sa)} — consider voluntary top-ups.</p>
          )}
        </div>
      )}
      <PreviewResult value={total} label="Total CPF Balance (SGD)" />
    </div>
  )
}

// ── Property ─────────────────────────────────────────────────
function PropertyForm({ state, set }) {
  const [looking, setLooking] = useState(false)
  const [lookupMsg, setLookupMsg] = useState('')

  const marketVal = parseFloat(state.marketValue) || 0
  const loan = parseFloat(state.outstandingLoan) || 0
  const cpfUsed = parseFloat(state.cpfUsed) || 0
  const equity = Math.max(0, marketVal - loan)

  useEffect(() => {
    if (!state.postcode?.trim() || !/^\d{6}$/.test(state.postcode)) {
      setLookupMsg('')
      return
    }

    // Debounce property lookup to avoid rate limiting
    // Triggers on postcode change and updates address for all property types
    const timer = setTimeout(async () => {
      setLooking(true)
      setLookupMsg('')
      try {
        const data = await lookupPropertyByPostcode(state.postcode.trim())
        if (data?.address) {
          // Update the state with the address
          const addressStr = [data.block, data.street, data.building].filter(Boolean).join(' ')
          set(prev => ({ ...prev, address: addressStr || data.address }))
          
          let estimatedPrice = null
          let message = `Found: ${data.address}`

          // Only auto-fill price for HDB Flats
          if (state.propertyType === 'HDB Flat' && data?.hdb?.comparableSales && state.rooms) {
            console.log(`[HDB Pricing] Searching for room type: "${state.rooms}"`)
            console.log(`[HDB Pricing] Available sales:`, data.hdb.comparableSales.map(s => ({ flatType: s.flatType, price: s.resalePrice })))
            
            // Extract room number from selection (e.g., "3-room" → "3")
            const roomCount = state.rooms.split('-')[0].trim()
            const roomQuery = state.rooms.toUpperCase().replace('-', ' ')
            
            // Try multiple matching strategies for flat_type field
            let matchingComparables = data.hdb.comparableSales.filter(sale => {
              const saleType = (sale.flatType || '').toUpperCase()
              // Match "2-room" against "2 ROOM", "2-ROOM", or "2ROOM" formats
              return saleType.includes(roomQuery) || 
                     saleType.replace(/-/g, ' ').includes(roomQuery) ||
                     saleType.replace(/\s+/g, '').includes(roomQuery.replace(/\s+/g, ''))
            })
            
            // If still no matches, try just matching the room count
            if (matchingComparables.length === 0) {
              matchingComparables = data.hdb.comparableSales.filter(sale => {
                const saleType = (sale.flatType || '').toUpperCase()
                return saleType.startsWith(roomCount + ' ') || 
                       saleType.startsWith(roomCount + '-') ||
                       saleType.startsWith(roomCount.trim())
              })
            }

            console.log(`[HDB Pricing] Matched ${matchingComparables.length} comparable sales out of ${data.hdb.comparableSales.length}`)

            if (matchingComparables.length > 0) {
              // Calculate average price for this room type
              const avgPrice = Math.round(
                matchingComparables.reduce((sum, sale) => sum + (sale.resalePrice || 0), 0) /
                matchingComparables.length
              )

              // Apply floor level adjustment
              const floorMultipliers = {
                'Low (1-5)': 0.95,
                'Mid (6-15)': 1.0,
                'High (16+)': 1.06,
              }
              const floorMult = floorMultipliers[state.floorLevel] || 1.0
              estimatedPrice = Math.round(avgPrice * floorMult)

              console.log(`[HDB Pricing] Using comparables: avg=${avgPrice}, floorMult=${floorMult}, final=${estimatedPrice}`)
              message += ` (${state.rooms} ${state.floorLevel} avg from ${matchingComparables.length} sales)`
            } else if (data?.hdb?.latestResalePrice) {
              // Fallback: use latest resale price with room+floor-based multipliers  
              const roomMultipliers = {
                '1-room': 0.55,
                '2-room': 0.75,
                '3-room': 1.0,
                '4-room': 1.25,
                '5-room': 1.55,
                'executive': 1.8,
              }
              const floorMultipliers = {
                'Low (1-5)': 0.95,
                'Mid (6-15)': 1.0,
                'High (16+)': 1.06,
              }
              const roomMult = roomMultipliers[state.rooms] || 1
              const floorMult = floorMultipliers[state.floorLevel] || 1.0
              estimatedPrice = Math.round(data.hdb.latestResalePrice * roomMult * floorMult)
              
              console.log(`[HDB Pricing] Using latest price fallback: ${data.hdb.latestResalePrice} * ${roomMult} * ${floorMult} = ${estimatedPrice}`)
              message += ` (est. ${state.rooms} ${state.floorLevel})`
            }
          } 
          // If no rooms selected but has HDB data, use latest price
          else if (data?.hdb?.latestResalePrice) {
            estimatedPrice = data.hdb.latestResalePrice
            message += ` (HDB latest)`
          }

          if (estimatedPrice) {
            set({ ...state, marketValue: String(estimatedPrice) })
          }
          setLookupMsg(message)
        }
      } catch (err) {
        setLookupMsg(err.message || 'Unable to fetch property data.')
      } finally { setLooking(false) }
    }, 1500) // Increased debounce to avoid rate limiting

    return () => clearTimeout(timer)
  }, [state.postcode]) // Only depend on postcode to avoid redundant API calls

  async function handlePostcodeLookup() {
    if (!state.postcode.trim()) return
    setLooking(true); setLookupMsg('')
    try {
      const data = await lookupPropertyByPostcode(state.postcode.trim())
      if (data?.address) {
        // Always update the address for all property types
        const addressStr = [data.block, data.street, data.building].filter(Boolean).join(' ')
        set(prev => ({ ...prev, address: addressStr || data.address }))
        
        let estimatedPrice = null
        let message = `Found: ${data.address}`

        // Only auto-fill price for HDB flats
        if (state.propertyType === 'HDB Flat' && data?.hdb?.comparableSales && state.rooms) {
          // Convert room selection to match flat_type in data (e.g., "3-room" → "3 ROOM")
          const roomQuery = state.rooms.toUpperCase().replace('-', ' ')
          const matchingComparables = data.hdb.comparableSales.filter(sale =>
            sale.flatType && sale.flatType.toUpperCase().includes(roomQuery)
          )

          if (matchingComparables.length > 0) {
            // Calculate average price for this room type
            let avgPrice = Math.round(
              matchingComparables.reduce((sum, sale) => sum + (sale.resalePrice || 0), 0) /
              matchingComparables.length
            )

            // Apply floor level adjustment
            const floorMultipliers = {
              'Low (1-5)': 0.95,
              'Mid (6-15)': 1.0,
              'High (16+)': 1.06,
            }
            const floorMult = floorMultipliers[state.floorLevel] || 1.0
            estimatedPrice = Math.round(avgPrice * floorMult)

            message += ` (${state.rooms} ${state.floorLevel} avg from ${matchingComparables.length} sales)`
          } else if (data?.hdb?.latestResalePrice) {
            // Fallback: use latest resale price with room+floor-based multipliers  
            const roomMultipliers = {
              '1-room': 0.55,
              '2-room': 0.75,
              '3-room': 1.0,
              '4-room': 1.25,
              '5-room': 1.55,
              'executive': 1.8,
            }
            const floorMultipliers = {
              'Low (1-5)': 0.95,
              'Mid (6-15)': 1.0,
              'High (16+)': 1.06,
            }
            const roomMult = roomMultipliers[state.rooms] || 1
            const floorMult = floorMultipliers[state.floorLevel] || 1.0
            estimatedPrice = Math.round(data.hdb.latestResalePrice * roomMult * floorMult)
            message += ` (est. ${state.rooms} ${state.floorLevel})`
          }
        } 
        // If HDB but no rooms selected, use latest price
        else if (state.propertyType === 'HDB Flat' && data?.hdb?.latestResalePrice) {
          estimatedPrice = data.hdb.latestResalePrice
          message += ` (HDB latest)`
        }

        // Only populate price if HDB type, otherwise user must manually enter
        if (estimatedPrice) {
          set(prev => ({ ...prev, marketValue: String(estimatedPrice) }))
        }
        setLookupMsg(message)
      }
    } catch (err) {
      setLookupMsg(err.message || 'Postcode not found.')
    } finally { setLooking(false) }
  }

  return (
    <div className="space-y-4">
      <Field label="Property Type">
        <Select value={state.propertyType} onChange={v => set({ ...state, propertyType: v })}>
          {['HDB Flat', 'Condo', 'Executive Condo', 'Landed', 'Commercial', 'Industrial'].map(t => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Postal Code" hint="For address lookup">
          <Input value={state.postcode} onChange={v => set({ ...state, postcode: v })} placeholder="e.g. 520123" />
        </Field>
        <FetchButton onClick={handlePostcodeLookup} loading={looking} label="Lookup" />
      </div>
      {lookupMsg && (
        <p className="text-xs text-white/40 px-1">{lookupMsg}</p>
      )}
      {state.propertyType === 'HDB Flat' && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Number of Rooms">
            <Select value={state.rooms} onChange={v => set({ ...state, rooms: v })}>
              <option value="">Select...</option>
              {['1-room', '2-room', '3-room', '4-room', '5-room', '6-room', 'Executive'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Floor Level">
            <Select value={state.floorLevel} onChange={v => set({ ...state, floorLevel: v })}>
              <option value="">Select...</option>
              {['Low (1-5)', 'Mid (6-15)', 'High (16+)'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {state.address && (
        <Field label="Address">
          <div className="p-2 text-sm text-white/60 bg-white/5 rounded">{state.address}</div>
        </Field>
      )}
      <Field label="Estimated Market Value (SGD)">
        <Input type="number" step="1000" min="0" value={state.marketValue} onChange={v => set({ ...state, marketValue: v })} placeholder="e.g. 850000" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Outstanding Loan (SGD)">
          <Input type="number" step="1000" min="0" value={state.outstandingLoan} onChange={v => set({ ...state, outstandingLoan: v })} placeholder="e.g. 400000" />
        </Field>
        <Field label="CPF Used (SGD)" hint="Optional">
          <Input type="number" step="1000" min="0" value={state.cpfUsed} onChange={v => set({ ...state, cpfUsed: v })} placeholder="e.g. 80000" />
        </Field>
      </div>
      {marketVal > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Market Value', val: marketVal },
            { label: 'Outstanding Loan', val: loan },
            { label: 'Net Equity', val: equity },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-semibold text-white/80">{formatSGD(val)}</p>
            </div>
          ))}
        </div>
      )}
      <PreviewResult value={equity} label="Property Equity (SGD)" />
    </div>
  )
}

// ── Crypto ───────────────────────────────────────────────────
function CryptoForm({ state, set }) {
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState('')
  const [fetchOk, setFetchOk] = useState(false)

  const priceSgd = parseFloat(state.priceSgd) || 0
  const qty = parseFloat(state.quantity) || 0
  const value = qty * priceSgd

  async function handleFetch() {
    if (!state.symbol.trim()) return
    setFetching(true); setFetchMsg(''); setFetchOk(false)
    try {
      const data = await lookupPrice(state.symbol.trim(), 'crypto')
      set({ ...state, priceSgd: String(data.priceSgd?.toFixed(4) || '') })
      setFetchMsg(`S$${data.priceSgd?.toFixed(4)} per ${state.symbol.toUpperCase()}`)
      setFetchOk(true)
    } catch (err) {
      setFetchMsg(err.message || 'Token not found.')
    } finally { setFetching(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Token Symbol" hint="e.g. BTC, ETH, SOL">
          <Input value={state.symbol} onChange={v => set({ ...state, symbol: v.toUpperCase() })} placeholder="BTC" />
        </Field>
        <FetchButton onClick={handleFetch} loading={fetching} />
      </div>
      {fetchMsg && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${fetchOk ? 'bg-amber-400/[0.08] text-amber-300' : 'bg-red-400/[0.08] text-red-300'}`}>
          {fetchOk ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
          {fetchMsg}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity">
          <Input type="number" step="any" min="0" value={state.quantity} onChange={v => set({ ...state, quantity: v })} placeholder="e.g. 0.5" />
        </Field>
        <Field label="Price (SGD)" hint="Auto-filled from CoinGecko">
          <Input type="number" step="any" min="0" value={state.priceSgd} onChange={v => set({ ...state, priceSgd: v })} placeholder="e.g. 95000" />
        </Field>
      </div>
      <Field label="Exchange / Wallet" hint="Optional">
        <Input value={state.exchange} onChange={v => set({ ...state, exchange: v })} placeholder="e.g. Coinbase, Ledger" />
      </Field>
      <PreviewResult value={value} label="Position Value (SGD)" />
    </div>
  )
}

// ── Other Assets ─────────────────────────────────────────────
function OtherForm({ state, set }) {
  const value = parseFloat(state.value) || 0

  return (
    <div className="space-y-4">
      <Field label="Asset Name">
        <Input value={state.name} onChange={v => set({ ...state, name: v })} placeholder="e.g. Car, Art Collection, Angel Investment" />
      </Field>
      <Field label="Asset Category">
        <Select value={state.category} onChange={v => set({ ...state, category: v })}>
          <option value="BONDS">Bonds / Fixed Income</option>
          <option value="FOREX">Foreign Currency</option>
          <option value="OTHER">Other</option>
        </Select>
      </Field>
      <Field label="Estimated Value (SGD)">
        <Input type="number" step="1" min="0" value={state.value} onChange={v => set({ ...state, value: v })} placeholder="e.g. 45000" />
      </Field>
      <Field label="Liquidity Level">
        <Select value={state.liquidity} onChange={v => set({ ...state, liquidity: v })}>
          <option value="Liquid">Liquid — can sell quickly</option>
          <option value="Medium">Medium — weeks to sell</option>
          <option value="Illiquid">Illiquid — months or more</option>
        </Select>
      </Field>
      <Field label="Notes" hint="Optional">
        <Input value={state.notes} onChange={v => set({ ...state, notes: v })} placeholder="Any details about this asset" />
      </Field>
      <PreviewResult value={value} label="Asset Value (SGD)" />
    </div>
  )
}

function PreviewResult({ value, label, positive }) {
  const hasValue = value > 0
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1">{label}</p>
      <p className={`text-lg font-bold ${hasValue ? (positive === false ? 'text-red-400' : 'text-emerald-400') : 'text-white/25'}`}>
        {hasValue ? formatSGD(value) : '—'}
      </p>
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────
export default function AddAssetModal({ onClose }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('stocks')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Per-tab form states
  const [cash, setCash] = useState({ institution: '', accountType: 'Savings', balance: '', currency: 'SGD', fxRate: '1' })
  const [stocks, setStocks] = useState({ ticker: '', name: '', quantity: '', priceSgd: '', currency: 'USD', fxRate: '1.35', brokerage: '', purchaseDate: today, costBasis: '' })
  const [cpf, setCpf] = useState({ accountType: 'OA', oa: '', sa: '', ma: '', monthly: '' })
  const [property, setProperty] = useState({ propertyType: 'HDB Flat', postcode: '', address: '', marketValue: '', outstandingLoan: '', cpfUsed: '', rooms: '', floorLevel: '' })
  const [crypto, setCrypto] = useState({ symbol: '', quantity: '', priceSgd: '', exchange: '' })
  const [other, setOther] = useState({ name: '', category: 'OTHER', value: '', liquidity: 'Medium', notes: '' })

  // Derived: estimated value, category, and payload for current tab
  const { estimatedValue, category, liquidity, buildPayload } = useMemo(() => {
    switch (activeTab) {
      case 'cash': {
        const fx = parseFloat(cash.fxRate) || DEFAULT_FX[cash.currency] || 1
        const value = (parseFloat(cash.balance) || 0) * fx
        return {
          estimatedValue: value, category: 'CASH', liquidity: 'Liquid',
          buildPayload: () => ({
            name: [cash.accountType, cash.institution].filter(Boolean).join(' – ') || 'Bank Account',
            category: 'CASH', value, cost: value, date: today,
            institution: cash.institution || undefined,
            details: { accountType: cash.accountType, currency: cash.currency, fxRate: fx },
          }),
        }
      }
      case 'stocks': {
        const qty = parseFloat(stocks.quantity) || 0
        const price = parseFloat(stocks.priceSgd) || 0
        const costPer = parseFloat(stocks.costBasis) || 0
        const fx = parseFloat(stocks.fxRate) || 1.35
        const value = qty * price
        const cost = costPer > 0 ? qty * costPer * fx : value
        return {
          estimatedValue: value, category: 'STOCKS', liquidity: 'Liquid',
          buildPayload: () => {
            const payload = {
              name: stocks.name || stocks.ticker || 'Stock',
              category: 'STOCKS', value, cost,
              date: stocks.purchaseDate || today,
              institution: stocks.brokerage || undefined,
              details: { currency: stocks.currency, importedFrom: 'manual' },
            }
            if (stocks.ticker) { payload.ticker = stocks.ticker; payload.quantity = qty }
            return payload
          },
        }
      }
      case 'cpf': {
        const value = (parseFloat(cpf.oa) || 0) + (parseFloat(cpf.sa) || 0) + (parseFloat(cpf.ma) || 0)
        return {
          estimatedValue: value, category: 'CPF', liquidity: 'Illiquid',
          buildPayload: () => ({
            name: 'CPF', category: 'CPF', value, cost: value, date: today,
            institution: 'CPF Board',
            details: { accountType: cpf.accountType || 'OA', oa: parseFloat(cpf.oa) || 0, sa: parseFloat(cpf.sa) || 0, ma: parseFloat(cpf.ma) || 0, monthlyContribution: parseFloat(cpf.monthly) || 0 },
          }),
        }
      }
      case 'property': {
        const mkt = parseFloat(property.marketValue) || 0
        const loan = parseFloat(property.outstandingLoan) || 0
        const equity = Math.max(0, mkt - loan)
        return {
          estimatedValue: equity, category: 'PROPERTY', liquidity: 'Illiquid',
          buildPayload: () => ({
            name: property.propertyType + (property.postcode ? ` (${property.postcode})` : ''),
            category: 'PROPERTY', value: equity, cost: equity, date: today,
            details: { propertyType: property.propertyType, marketValue: mkt, outstandingLoan: loan, cpfUsed: parseFloat(property.cpfUsed) || 0, postcode: property.postcode, rooms: property.rooms, floorLevel: property.floorLevel },
          }),
        }
      }
      case 'crypto': {
        const qty = parseFloat(crypto.quantity) || 0
        const price = parseFloat(crypto.priceSgd) || 0
        const value = qty * price
        return {
          estimatedValue: value, category: 'CRYPTO', liquidity: 'Liquid',
          buildPayload: () => {
            const payload = {
              name: crypto.symbol || 'Crypto',
              category: 'CRYPTO', value, cost: value, date: today,
              institution: crypto.exchange || undefined,
              details: { importedFrom: 'manual' },
            }
            if (crypto.symbol) { payload.ticker = crypto.symbol; payload.quantity = qty }
            return payload
          },
        }
      }
      case 'other': {
        const value = parseFloat(other.value) || 0
        return {
          estimatedValue: value, category: other.category, liquidity: other.liquidity,
          buildPayload: () => ({
            name: other.name || 'Other Asset',
            category: other.category, value, cost: value, date: today,
            details: { liquidity: other.liquidity, notes: other.notes },
          }),
        }
      }
      default:
        return { estimatedValue: 0, category: 'OTHER', liquidity: 'Medium', buildPayload: () => ({}) }
    }
  }, [activeTab, cash, stocks, cpf, property, crypto, other])

  async function handleSubmit() {
    if (!estimatedValue || estimatedValue <= 0) {
      setSubmitError('Please enter a valid asset value before adding.')
      return
    }
    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createAsset(buildPayload())
      setSubmitted(true)
      // Navigate to Assets page after successful creation
      setTimeout(() => {
        onClose()
        navigate('/assets')
      }, 900)
    } catch (err) {
      setSubmitError(err.message || 'Failed to add asset.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = estimatedValue > 0 && !isSubmitting && !submitted
  const currentTab = TABS.find(t => t.key === activeTab)

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-card w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
              <Wallet className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Add Asset to Wealth Wallet</h2>
              <p className="text-xs text-white/40 mt-0.5">Track any asset and see its impact on your financial health.</p>
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tab bar ────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2.5 flex-shrink-0 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key} type="button"
                onClick={() => { setActiveTab(tab.key); setSubmitError('') }}
                className={`flex items-center gap-1.5 flex-shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'cash'     && <CashForm     state={cash}     set={setCash} />}
          {activeTab === 'stocks'   && <StocksForm   state={stocks}   set={setStocks} />}
          {activeTab === 'cpf'      && <CPFForm      state={cpf}      set={setCpf} />}
          {activeTab === 'property' && <PropertyForm state={property} set={setProperty} />}
          {activeTab === 'crypto'   && <CryptoForm   state={crypto}   set={setCrypto} />}
          {activeTab === 'other'    && <OtherForm    state={other}    set={setOther} />}
        </div>

        {/* ── Wealth Impact Preview ──────────────────────────── */}
        <div className="border-t border-white/[0.06] px-6 py-4 flex-shrink-0 bg-white/[0.015]">
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">Wealth Impact Preview</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Est. Value', value: estimatedValue > 0 ? formatSGD(estimatedValue) : '—', accent: estimatedValue > 0 },
              { label: 'Category', value: currentTab?.label || category },
              { label: 'Liquidity', value: LIQUIDITY[category] || liquidity },
              { label: 'Impact', value: estimatedValue > 0 ? `+${formatSGD(estimatedValue)}` : '—', accent: estimatedValue > 0 },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-sm font-semibold truncate ${accent ? 'text-emerald-400' : 'text-white/60'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="border-t border-white/[0.06] px-6 py-4 flex-shrink-0 flex items-center gap-3">
          {submitError && (
            <div className="flex items-center gap-1.5 text-xs text-red-300 flex-1">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {submitError}
            </div>
          )}
          {submitted && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 flex-1">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              Asset added successfully!
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
                : submitted
                  ? <><CheckCircle2 className="h-4 w-4" /> Added!</>
                  : 'Add to Wealth Wallet →'
              }
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
