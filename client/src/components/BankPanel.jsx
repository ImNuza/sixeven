import { useState, useEffect } from 'react'
import { Building2, ChevronDown, ChevronUp, Download, X, Check, Loader2, Landmark, CreditCard, TrendingUp, Trash2, Wifi, RefreshCw } from 'lucide-react'
import { createAsset, connectOcbc, fetchOcbcAccounts, fetchOcbcStatus, disconnectOcbc, fetchUobAccounts, lookupExchangeRate } from '../services/api.js'

const BANKS = [
  { id: 'dbs',  name: 'DBS Bank',           country: 'SG', color: '#d3212d', logo: 'D' },
  { id: 'ocbc', name: 'OCBC Bank',           country: 'SG', color: '#e94e1b', logo: 'O' },
  { id: 'uob',  name: 'UOB',                 country: 'SG', color: '#005baa', logo: 'U' },
  { id: 'hsbc', name: 'HSBC',                country: 'SG/INTL', color: '#db0011', logo: 'H' },
  { id: 'sc',   name: 'Standard Chartered',  country: 'SG/INTL', color: '#00aeef', logo: 'S' },
  { id: 'citi', name: 'Citibank',            country: 'SG/INTL', color: '#003b8e', logo: 'C' },
  { id: 'maybank', name: 'Maybank',          country: 'SG/MY',   color: '#ffcb00', logo: 'M' },
  { id: 'chase', name: 'Chase',              country: 'US',  color: '#117aca', logo: 'C' },
  { id: 'boa',   name: 'Bank of America',    country: 'US',  color: '#e31837', logo: 'B' },
  { id: 'barclays', name: 'Barclays',        country: 'UK',  color: '#00aeef', logo: 'B' },
]

// Fallback hardcoded rates (used if API fails)
const FALLBACK_FX = { SGD: 1, USD: 1.35, GBP: 1.71, EUR: 1.47 }

const MOCK_ACCOUNTS = {
  dbs:     [{ name: 'DBS Multiplier', type: 'depository', subtype: 'savings',    balance: 12450.80, currency: 'SGD', mask: '4821' },
             { name: 'DBS Vickers',   type: 'investment',  subtype: 'brokerage',  balance: 8200.00,  currency: 'SGD', mask: '9934' }],
  ocbc:    [{ name: 'OCBC 360 Account', type: 'depository', subtype: 'savings',  balance: 5680.50, currency: 'SGD', mask: '3312' }],
  uob:     [{ name: 'UOB One Account', type: 'depository',  subtype: 'savings',  balance: 15000.00, currency: 'SGD', mask: '7701' },
             { name: 'UOB Lady\'s Card', type: 'credit',    subtype: 'credit card', balance: -1240.50, currency: 'SGD', mask: '5529' }],
  hsbc:    [{ name: 'HSBC Everyday', type: 'depository',  subtype: 'checking',  balance: 3200.00, currency: 'SGD', mask: '8801' }],
  sc:      [{ name: 'SC JumpStart',  type: 'depository',  subtype: 'savings',   balance: 7500.00, currency: 'SGD', mask: '4490' }],
  citi:    [{ name: 'Citi MaxiGain', type: 'depository',  subtype: 'savings',   balance: 22000.00, currency: 'SGD', mask: '0021' }],
  maybank: [{ name: 'Maybank SaveUp', type: 'depository', subtype: 'savings',   balance: 4100.00, currency: 'SGD', mask: '6643' }],
  chase:   [{ name: 'Chase Total Checking', type: 'depository', subtype: 'checking', balance: 4800.00, currency: 'USD', mask: '2290' },
             { name: 'Chase Savings',        type: 'depository', subtype: 'savings',  balance: 12000.00, currency: 'USD', mask: '4481' }],
  boa:     [{ name: 'BofA Advantage', type: 'depository', subtype: 'checking', balance: 3100.00, currency: 'USD', mask: '9921' }],
  barclays:[{ name: 'Barclays Current', type: 'depository', subtype: 'checking', balance: 2400.00, currency: 'GBP', mask: '7731' }],
}

const TYPE_ICON = { depository: Landmark, investment: TrendingUp, credit: CreditCard }

function ConnectModal({ onClose, onConnected }) {
  const [step, setStep] = useState('pick') // pick | loading | done
  const [chosen, setChosen] = useState(null)

  async function selectBank(bank) {
    setChosen(bank)
    setStep('loading')
    await new Promise(r => setTimeout(r, 1800))
    setStep('done')
    setTimeout(() => {
      onConnected({ bank, accounts: MOCK_ACCOUNTS[bank.id] || [] })
      onClose()
    }, 900)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-sm rounded-3xl border border-white/[0.1] bg-[#0d1525] shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/35 mb-0.5">Open Banking</p>
            <h3 className="text-base font-semibold text-white">Select your bank</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'pick' && (
          <div className="p-4 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {BANKS.map(bank => (
              <button
                key={bank.id}
                onClick={() => selectBank(bank)}
                className="flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left hover:border-white/[0.12] hover:bg-white/[0.05] transition-all"
              >
                <div className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: `${bank.color}30`, color: bank.color }}>
                  {bank.logo}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/85 truncate">{bank.name}</p>
                  <p className="text-[10px] text-white/30">{bank.country}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${chosen?.color}20` }}>
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: chosen?.color }} />
            </div>
            <p className="text-sm font-semibold text-white/80">Connecting to {chosen?.name}</p>
            <p className="text-xs text-white/35 mt-1">Establishing secure connection…</p>
            <div className="mt-4 flex gap-1">
              {['Authenticating', 'Fetching accounts', 'Syncing balances'].map((s, i) => (
                <span key={s} className="text-[10px] text-white/25 bg-white/[0.04] rounded-full px-2 py-0.5">{s}</span>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white/80">{chosen?.name} connected!</p>
            <p className="text-xs text-white/35 mt-1">Loading your accounts…</p>
          </div>
        )}

        <div className="px-6 pb-4 pt-2 border-t border-white/[0.04]">
          <p className="text-[10px] text-white/20 text-center">256-bit encryption · Read-only access · Revoke anytime</p>
        </div>
      </div>
    </div>
  )
}

// ── OCBC Live Integration Panel ────────────────────────────────
function OcbcLivePanel({ onImportDone }) {
  const [status, setStatus]     = useState(null)   // null | 'connected' | 'disconnected'
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError]       = useState('')
  const [importedIds, setImportedIds] = useState(new Set())

  async function loadStatus() {
    try {
      setLoading(true)
      const s = await fetchOcbcStatus()
      setStatus(s.connected ? 'connected' : 'disconnected')
      if (s.connected) {
        try {
          const data = await fetchOcbcAccounts()
          const list = data?.accounts || data?.data?.accounts || data || []
          setAccounts(Array.isArray(list) ? list : [])
        } catch (accErr) {
          setError(`Connected but could not load accounts: ${accErr.message}`)
        }
      }
    } catch {
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  async function handleConnect() {
    try {
      setConnecting(true)
      setError('')
      await connectOcbc()
      await loadStatus()
    } catch (err) {
      setError(err.message)
      setStatus('disconnected')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectOcbc()
      setStatus('disconnected')
      setAccounts([])
    } catch (err) {
      setError(err.message)
    }
  }

  async function importAccount(account) {
    const key = account.accountId || account.id || account.accountNumber
    if (importedIds.has(key)) return
    const balance = account.balance?.amount || account.availableBalance?.amount || account.currentBalance || 0
    const currency = account.balance?.currency || account.currency || 'SGD'
    // Fetch the real FX rate instead of hardcoding
    const rate = currency !== 'SGD' ? await lookupExchangeRate(currency, 'SGD') : 1
    const sgd = balance * rate
    const today = new Date().toISOString().split('T')[0]
    await createAsset({
      name: account.accountName || account.name || `OCBC ${account.accountType || 'Account'}`,
      category: 'CASH',
      ticker: null,
      quantity: null,
      value: Math.max(0, sgd),
      cost: Math.max(0, sgd),
      date: today,
      institution: 'OCBC Bank',
      details: { accountType: account.accountType, currency, mask: String(account.accountNumber || '').slice(-4), importedFrom: 'ocbc' },
    })
    setImportedIds(prev => new Set([...prev, key]))
    onImportDone?.()
  }

  return (
    <div className="rounded-2xl border border-[#e94e1b]/20 bg-[#e94e1b]/[0.03] overflow-hidden mb-4">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: '#e94e1b20', color: '#e94e1b' }}>O</div>
          <div>
            <p className="text-sm font-semibold text-white/90">OCBC Bank</p>
            <p className="text-xs text-white/35">
              {loading ? 'Checking connection…' : status === 'connected' ? `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · Live` : 'Not connected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'connected' ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <button onClick={handleDisconnect} className="text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/[0.07]">Disconnect</button>
            </>
          ) : !loading && (
            <button onClick={handleConnect} disabled={connecting} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold" style={{ background: '#e94e1b18', color: '#e94e1b', border: '1px solid #e94e1b30', opacity: connecting ? 0.6 : 1 }}>
              {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
              {connecting ? 'Connecting…' : 'Connect OCBC'}
            </button>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
        </div>
      </div>

      {error && (
        <div className="px-5 py-3 text-xs text-red-400/80 bg-red-500/[0.04] border-b border-red-500/10">{error}</div>
      )}

      {status === 'connected' && accounts.length > 0 && (
        <div className="px-4 py-3 space-y-0">
          {accounts.map((a, i) => {
            const key = a.accountId || a.id || a.accountNumber || i
            const done = importedIds.has(key)
            const balance = a.balance?.amount ?? a.availableBalance?.amount ?? a.currentBalance ?? 0
            const currency = a.balance?.currency || a.currency || 'SGD'
            return (
              <div key={key} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <Landmark className="h-3.5 w-3.5 text-[#e94e1b]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/90">{a.accountName || a.name || 'Account'}</p>
                    <p className="text-xs text-white/35 capitalize">{a.accountType || a.type || 'savings'} ···{String(a.accountNumber || '').slice(-4)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <p className="text-sm font-mono text-white/80 text-right">
                    {currency} {Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {done ? (
                    <span className="text-xs text-emerald-400 font-medium w-14 text-right">Added ✓</span>
                  ) : (
                    <button onClick={() => importAccount(a)} className="text-xs text-accent border border-accent/20 bg-accent/8 rounded-lg px-2.5 py-1 hover:bg-accent/18 transition-colors w-14 text-center">
                      Import
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <button
            onClick={() => Promise.all(accounts.map(a => importAccount(a)))}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Import All Accounts
          </button>
        </div>
      )}

      {status === 'connected' && accounts.length === 0 && !loading && !error && (
        <div className="px-5 py-4 text-xs text-white/30 text-center">No accounts returned from OCBC API</div>
      )}

      {status === 'disconnected' && !loading && (
        <div className="px-5 py-4 text-xs text-white/25 text-center">
          Connect your OCBC account to import live balances · OAuth 2.0 · Read-only
        </div>
      )}
    </div>
  )
}

// ── UOB Live Integration Panel ────────────────────────────────
function UobLivePanel({ onImportDone }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [source, setSource]     = useState(null)
  const [error, setError]       = useState('')
  const [importedIds, setImportedIds] = useState(new Set())

  async function load() {
    try {
      setLoading(true)
      setError('')
      const data = await fetchUobAccounts()
      setAccounts(data?.accounts || [])
      setSource(data?.source || 'demo')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function importAccount(account) {
    const key = account.accountNumber
    if (importedIds.has(key)) return
    const today = new Date().toISOString().split('T')[0]
    await createAsset({
      name: account.accountName || `UOB ${account.accountType === 'D' ? 'Current' : 'Savings'} Account`,
      category: 'CASH',
      ticker: null,
      quantity: null,
      value: Math.max(0, account.availableBalance ?? account.balance ?? 0),
      cost:  Math.max(0, account.availableBalance ?? account.balance ?? 0),
      date: today,
      institution: 'UOB',
      details: { accountType: account.accountType, currency: account.currency || 'SGD', mask: String(account.accountNumber || '').slice(-4), importedFrom: 'uob' },
    })
    setImportedIds(prev => new Set([...prev, key]))
    onImportDone?.()
  }

  const UOB_BLUE = '#005baa'

  return (
    <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: `${UOB_BLUE}30`, background: `${UOB_BLUE}06` }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: `${UOB_BLUE}20`, color: UOB_BLUE }}>U</div>
          <div>
            <p className="text-sm font-semibold text-white/90">UOB</p>
            <p className="text-xs text-white/35">
              {loading ? 'Loading accounts…' : error ? 'Connection error' : `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${source === 'uob_live' ? 'Live' : 'Demo'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source === 'uob_live' && <Wifi className="h-3.5 w-3.5 text-emerald-400" />}
          {source === 'demo' && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400">Demo</span>}
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400/80 bg-red-500/[0.04] border-b border-red-500/10">{error}</div>}

      {!loading && accounts.length > 0 && (
        <div className="px-4 py-3 space-y-0">
          {accounts.map((a, i) => {
            const key = a.accountNumber || i
            const done = importedIds.has(key)
            const bal = a.availableBalance ?? a.balance ?? 0
            const currency = a.currency || 'SGD'
            return (
              <div key={key} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <Landmark className="h-3.5 w-3.5" style={{ color: UOB_BLUE }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/90">{a.accountName || 'UOB Account'}</p>
                    <p className="text-xs text-white/35">{a.accountType === 'D' ? 'Current' : 'Savings'} ···{String(a.accountNumber || '').slice(-4)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <p className="text-sm font-mono text-white/80 text-right">
                    {currency} {Number(bal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {done ? (
                    <span className="text-xs text-emerald-400 font-medium w-14 text-right">Added ✓</span>
                  ) : (
                    <button onClick={() => importAccount(a)} className="text-xs text-accent border border-accent/20 bg-accent/[0.08] rounded-lg px-2.5 py-1 hover:bg-accent/[0.18] transition-colors w-14 text-center">
                      Import
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <button
            onClick={() => accounts.forEach(a => importAccount(a))}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/[0.15] transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Import All Accounts
          </button>
        </div>
      )}

      {!loading && accounts.length === 0 && !error && (
        <div className="px-5 py-4 text-xs text-white/30 text-center">No accounts returned</div>
      )}
    </div>
  )
}

export default function BankPanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [connections, setConnections] = useState([])
  const [importedIds, setImportedIds] = useState(new Set())
  const [fxRates, setFxRates] = useState({ USD: FALLBACK_FX.USD, GBP: FALLBACK_FX.GBP, EUR: FALLBACK_FX.EUR })

  // Fetch real FX rates on mount
  useEffect(() => {
    async function fetchRates() {
      console.log('[BankPanel] Fetching real FX rates...')
      try {
        const [usdRate, gbpRate, eurRate] = await Promise.all([
          lookupExchangeRate('USD', 'SGD').catch(() => FALLBACK_FX.USD),
          lookupExchangeRate('GBP', 'SGD').catch(() => FALLBACK_FX.GBP),
          lookupExchangeRate('EUR', 'SGD').catch(() => FALLBACK_FX.EUR),
        ])
        console.log('[BankPanel] FX rates fetched:', { USD: usdRate, GBP: gbpRate, EUR: eurRate })
        setFxRates({ USD: usdRate, GBP: gbpRate, EUR: eurRate })
      } catch (err) {
        console.warn('[BankPanel] Failed to fetch FX rates:', err)
        // Use fallback rates
      }
    }
    fetchRates()
  }, [])

  function handleConnected({ bank, accounts }) {
    setConnections(prev => {
      const exists = prev.find(c => c.bank.id === bank.id)
      return exists ? prev : [...prev, { bank, accounts, open: true }]
    })
  }

  function toggleOpen(bankId) {
    setConnections(prev => prev.map(c => c.bank.id === bankId ? { ...c, open: !c.open } : c))
  }

  function remove(bankId) {
    setConnections(prev => prev.filter(c => c.bank.id !== bankId))
  }

  async function importAccount(bank, account) {
    const key = `${bank.id}-${account.mask}`
    if (importedIds.has(key)) return
    const rate = fxRates[account.currency] || FALLBACK_FX[account.currency] || 1
    const sgd = Math.abs(account.balance) * rate
    const today = new Date().toISOString().split('T')[0]
    await createAsset({
      name: account.name,
      category: account.type === 'investment' ? 'STOCKS' : account.type === 'credit' ? 'CASH' : 'CASH',
      ticker: null,
      quantity: null,
      value: Math.max(0, sgd),
      cost: Math.max(0, sgd),
      date: today,
      institution: bank.name,
      details: { accountSubtype: account.subtype, currency: account.currency, mask: account.mask, importedFrom: 'bank' },
    })
    setImportedIds(prev => new Set([...prev, key]))
    onImportDone?.()
  }

  async function importAll(bank, accounts) {
    for (const a of accounts) await importAccount(bank, a)
  }

  const totalAccounts = connections.reduce((n, c) => n + c.accounts.length, 0)

  return (
    <>
      {showModal && <ConnectModal onClose={() => setShowModal(false)} onConnected={handleConnected} />}

      <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white/90">Bank Accounts</p>
              <p className="text-xs text-white/35">
                {connections.length === 0
                  ? 'Connect DBS, OCBC, UOB, HSBC and more'
                  : `${connections.length} bank${connections.length > 1 ? 's' : ''} · ${totalAccounts} account${totalAccounts !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
        </button>

        {expanded && (
          <div className="px-6 pb-5 border-t border-white/[0.04]">
            {/* Live Bank Integrations */}
            <div className="pt-4">
              <OcbcLivePanel onImportDone={onImportDone} />
              <UobLivePanel onImportDone={onImportDone} />
            </div>

            <div className="flex items-center gap-3 pb-4 flex-wrap">
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/35 transition-shadow"
              >
                <Building2 className="h-4 w-4" />
                Other Banks (Demo)
              </button>
              <p className="text-xs text-white/25">SG, US, UK, EU · mock data</p>
            </div>

            {connections.length === 0 ? (
              <div className="py-6 text-center">
                <Building2 className="h-8 w-8 text-white/10 mx-auto mb-2" />
                <p className="text-sm text-white/25">No banks connected yet</p>
                <p className="text-xs text-white/15 mt-1">Connect your bank to import account balances</p>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map(({ bank, accounts, open }) => (
                  <div key={bank.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: `${bank.color}20`, color: bank.color }}>
                          {bank.logo}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/90">{bank.name}</p>
                          <p className="text-xs text-white/35">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => toggleOpen(bank.id)} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors">
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => remove(bank.id)} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="border-t border-white/[0.05] px-4 py-3">
                        {accounts.map(a => {
                          const key = `${bank.id}-${a.mask}`
                          const done = importedIds.has(key)
                          const Icon = TYPE_ICON[a.type] || Landmark
                          const rate = fxRates[a.currency] || FALLBACK_FX[a.currency] || 1
                          const sgd = Math.abs(a.balance) * rate
                          return (
                            <div key={key} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-7 w-7 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                                  <Icon className="h-3.5 w-3.5 text-emerald-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white/90">{a.name}</p>
                                  <p className="text-xs text-white/35 capitalize">{a.subtype} ···{a.mask}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="text-right">
                                  <p className="text-sm font-mono text-white/80">
                                    {a.currency} {Math.abs(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                  {a.currency !== 'SGD' && (
                                    <p className="text-xs text-white/30 font-mono">≈ SGD {sgd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                  )}
                                </div>
                                {done ? (
                                  <span className="text-xs text-emerald-400 font-medium w-14 text-right">Added ✓</span>
                                ) : (
                                  <button onClick={() => importAccount(bank, a)} className="text-xs text-accent border border-accent/20 bg-accent/8 rounded-lg px-2.5 py-1 hover:bg-accent/18 transition-colors w-14 text-center">
                                    Import
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        <button
                          onClick={() => importAll(bank, accounts)}
                          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Import All Accounts
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
