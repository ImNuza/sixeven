import { useState } from 'react'
import { ChevronDown, ChevronUp, Download, Unplug, Loader2, Check, Landmark, TrendingUp, ShieldCheck } from 'lucide-react'
import { createAsset } from '../services/api.js'

// ── Mock SGFinDex data (proof-of-concept) ─────────────────────
const MOCK_SGFINDEX = {
  name: 'TAN WEI MING',
  uinfin: 'S****345A',
  verifiedAt: new Date().toISOString(),
  cpf: {
    oa: 47830.52,
    sa: 21440.18,
    ma: 14200.00,
    ra: null, // only active for 55+
  },
  bankAccounts: [
    { bankCode: '7171', bankName: 'DBS Bank', accountType: 'Savings', accountNum: '***-***-4821' },
    { bankCode: '7339', bankName: 'OCBC Bank', accountType: 'Savings', accountNum: '***-***-3312' },
    { bankCode: '7375', bankName: 'UOB',       accountType: 'Current', accountNum: '***-***-7701' },
  ],
  investments: [
    { type: 'EQUITY', name: 'Singapore Airlines (C6L.SI)',  quantity: 300,  currency: 'SGD' },
    { type: 'EQUITY', name: 'DBS Group Holdings (D05.SI)',  quantity: 100,  currency: 'SGD' },
    { type: 'EQUITY', name: 'Nikko AM STI ETF (G3B.SI)',    quantity: 1200, currency: 'SGD' },
    { type: 'EQUITY', name: 'CapitaLand Integrated (C38U.SI)', quantity: 500, currency: 'SGD' },
  ],
  noa: { income: 78000, assessmentYear: 2025 },
}

function CPFBar({ label, value, max, color }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/45">{label}</span>
        <span className="text-xs font-mono font-semibold text-white/80">
          SGD {value.toLocaleString('en-SG', { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function SingpassPanel({ onImportDone }) {
  const [expanded, setExpanded] = useState(true)
  const [step, setStep] = useState('idle') // idle | loading | connected
  const [importedCpf, setImportedCpf] = useState(false)
  const [importedInv, setImportedInv] = useState(new Set())
  const data = MOCK_SGFINDEX

  async function handleConnect() {
    setStep('loading')
    await new Promise(r => setTimeout(r, 2200))
    setStep('connected')
  }

  function handleDisconnect() {
    setStep('idle')
    setImportedCpf(false)
    setImportedInv(new Set())
  }

  async function importCpf() {
    const today = new Date().toISOString().split('T')[0]
    const accounts = [
      { sub: 'Ordinary Account (OA)', value: data.cpf.oa },
      { sub: 'Special Account (SA)', value: data.cpf.sa },
      { sub: 'MediSave Account (MA)', value: data.cpf.ma },
    ].filter(a => a.value != null)
    for (const a of accounts) {
      await createAsset({
        name: `CPF ${a.sub}`,
        category: 'CPF',
        ticker: null,
        quantity: null,
        value: a.value,
        cost: a.value,
        date: today,
        institution: 'CPF Board',
        details: { importedFrom: 'sgfindex', sub: a.sub },
      })
    }
    setImportedCpf(true)
    onImportDone?.()
  }

  async function importInvestment(inv) {
    if (importedInv.has(inv.name)) return
    const today = new Date().toISOString().split('T')[0]
    await createAsset({
      name: inv.name,
      category: 'STOCKS',
      ticker: inv.name.match(/\((\S+)\)/)?.[1] || null,
      quantity: inv.quantity,
      value: 0,
      cost: 0,
      date: today,
      institution: 'CDP / SGX',
      details: { importedFrom: 'sgfindex', investmentType: inv.type, currency: inv.currency },
    })
    setImportedInv(prev => new Set([...prev, inv.name]))
    onImportDone?.()
  }

  async function importAllInvestments() {
    for (const inv of data.investments) await importInvestment(inv)
  }

  const cpfTotal = (data.cpf.oa || 0) + (data.cpf.sa || 0) + (data.cpf.ma || 0) + (data.cpf.ra || 0)

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(227,6,19,0.15)' }}>
            <ShieldCheck className="h-4 w-4" style={{ color: '#e30613' }} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white/90">Singpass · SGFinDex</p>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-500/30 text-amber-400/80 bg-amber-500/10">Prototype</span>
            </div>
            <p className="text-xs text-white/35">
              {step === 'connected'
                ? 'CPF · DBS, OCBC, UOB · SGX CDP holdings linked'
                : 'Planned: connect CPF, bank balances, SGX holdings via Singpass'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {step === 'connected' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Linked
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {/* Action row */}
          <div className="flex items-center gap-3 pt-4 pb-4 flex-wrap">
            {step !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={step === 'loading'}
                className="inline-flex items-center gap-2.5 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg,#e30613,#b8000f)', boxShadow: '0 4px 16px rgba(227,6,19,0.25)' }}
              >
                {step === 'loading' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Connecting to Singpass…</>
                ) : (
                  <><span className="font-bold tracking-tight">Singpass</span> Connect</>
                )}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/50 hover:text-red-400 hover:border-red-500/20 transition-colors"
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </button>
            )}
            <p className="text-xs text-white/20">
              {step === 'connected' ? `Data refreshed ${new Date().toLocaleDateString('en-SG')}` : 'DBS · OCBC · UOB · CPF Board · SGX · IRAS'}
            </p>
          </div>

          {/* Idle state */}
          {step === 'idle' && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">What SGFinDex will connect</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'CPF Balances', sub: 'OA · SA · MA · RA', color: '#2f7cf6' },
                  { label: 'Bank Accounts', sub: 'DBS · OCBC · UOB', color: '#18a871' },
                  { label: 'SGX Holdings', sub: 'Equities via CDP', color: '#f0a100' },
                ].map(({ label, sub, color }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: `${color}12`, border: `1px solid ${color}20` }}>
                    <p className="text-xs font-semibold mb-0.5" style={{ color }}>{label}</p>
                    <p className="text-[10px] text-white/35">{sub}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-white/20 leading-relaxed">
                Production integration requires a registered business entity with MAS/Singpass (developer.singpass.gov.sg).
                This prototype demonstrates the planned UX and data structure.
              </p>
            </div>
          )}

          {/* Loading state */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(227,6,19,0.12)' }}>
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#e30613' }} />
              </div>
              <p className="text-sm text-white/60">Connecting to Singpass…</p>
              <div className="flex gap-2">
                {['SGFinDex Auth', 'CPF Board', 'Bank APIs', 'SGX CDP'].map((s, i) => (
                  <span key={s} className="text-[10px] text-white/25 bg-white/[0.03] rounded-full px-2 py-0.5 border border-white/[0.05]">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Connected state */}
          {step === 'connected' && (
            <div className="space-y-3">
              {/* Identity */}
              <div className="flex items-center gap-3 py-1">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: 'rgba(227,6,19,0.2)', color: '#e30613' }}>
                  {data.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white/90">{data.name}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <Check className="h-3 w-3" />Verified
                    </span>
                  </div>
                  <p className="text-xs text-white/35">NRIC {data.uinfin} · Annual income SGD {data.noa.income.toLocaleString()}</p>
                </div>
              </div>

              {/* CPF */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">CPF Balances</p>
                    <p className="text-base font-bold text-white mt-0.5">
                      SGD {cpfTotal.toLocaleString('en-SG', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <button
                    onClick={importCpf}
                    disabled={importedCpf}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400 hover:bg-blue-500/18 transition-colors disabled:opacity-50"
                  >
                    {importedCpf ? <><Check className="h-3 w-3" />Imported</> : <><Download className="h-3 w-3" />Import</>}
                  </button>
                </div>
                <div className="space-y-3">
                  <CPFBar label="Ordinary Account (OA)" value={data.cpf.oa} max={cpfTotal} color="#2f7cf6" />
                  <CPFBar label="Special Account (SA)"  value={data.cpf.sa} max={cpfTotal} color="#a855f7" />
                  <CPFBar label="MediSave Account (MA)" value={data.cpf.ma} max={cpfTotal} color="#10b981" />
                </div>
              </div>

              {/* Bank Accounts */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-3">Linked Bank Accounts</p>
                {data.bankAccounts.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                    <Landmark className="h-4 w-4 text-white/25 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-white/80 font-medium">{b.bankName}</p>
                      <p className="text-xs text-white/35">{b.accountType} · {b.accountNum}</p>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">Linked</span>
                  </div>
                ))}
                <p className="mt-2 text-[10px] text-white/20">Balance data retrieved directly from banks via SGFinDex open banking protocol</p>
              </div>

              {/* SGX Investments */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">SGX / CDP Holdings</p>
                  <button
                    onClick={importAllInvestments}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-accent/25 bg-accent/10 text-accent hover:bg-accent/18 transition-colors"
                  >
                    <Download className="h-3 w-3" />Import All
                  </button>
                </div>
                {data.investments.map((inv) => {
                  const done = importedInv.has(inv.name)
                  return (
                    <div key={inv.name} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
                      <TrendingUp className="h-4 w-4 text-accent/50 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 truncate">{inv.name}</p>
                        <p className="text-xs text-white/35">{inv.quantity.toLocaleString()} units · {inv.currency}</p>
                      </div>
                      {done ? (
                        <span className="text-xs text-emerald-400 font-medium">Added ✓</span>
                      ) : (
                        <button
                          onClick={() => importInvestment(inv)}
                          className="text-xs text-accent border border-accent/20 bg-accent/8 rounded-lg px-2.5 py-1 hover:bg-accent/18 transition-colors flex-shrink-0"
                        >
                          Import
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
