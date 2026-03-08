import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, X } from 'lucide-react'

const MODES = [
  { key: 'position', label: 'Position Value' },
  { key: 'return', label: 'P&L Calculator' },
  { key: 'compound', label: 'Growth Projection' },
  { key: 'cpf', label: 'CPF Planner' },
]

function formatSGD(value) {
  if (isNaN(value) || !isFinite(value)) return '—'
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 2 }).format(value)
}

function formatPct(value) {
  if (isNaN(value) || !isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function PositionCalc() {
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [fxRate, setFxRate] = useState('1')

  const positionValue = parseFloat(qty) * parseFloat(price) * parseFloat(fxRate)

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40 leading-relaxed">Calculate the SGD value of any position by entering quantity, unit price, and FX rate.</p>
      <CalcInput label="Quantity" value={qty} onChange={setQty} placeholder="e.g. 10.5" />
      <CalcInput label="Unit Price (local currency)" value={price} onChange={setPrice} placeholder="e.g. 185.50" />
      <CalcInput label="FX Rate to SGD (1 if already SGD)" value={fxRate} onChange={setFxRate} placeholder="e.g. 1.35 for USD/SGD" />
      <ResultBox label="Position Value (SGD)" value={formatSGD(positionValue)} positive />
    </div>
  )
}

function ReturnCalc() {
  const [buyPrice, setBuyPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [quantity, setQuantity] = useState('')

  const gain = (parseFloat(currentPrice) - parseFloat(buyPrice)) * (parseFloat(quantity) || 1)
  const pct = ((parseFloat(currentPrice) - parseFloat(buyPrice)) / parseFloat(buyPrice)) * 100

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40 leading-relaxed">Calculate the unrealised gain/loss on any position in the same currency.</p>
      <CalcInput label="Buy Price (per unit)" value={buyPrice} onChange={setBuyPrice} placeholder="e.g. 150.00" />
      <CalcInput label="Current Price (per unit)" value={currentPrice} onChange={setCurrentPrice} placeholder="e.g. 185.00" />
      <CalcInput label="Quantity (optional)" value={quantity} onChange={setQuantity} placeholder="e.g. 10 (default 1)" />
      <div className="grid grid-cols-2 gap-3">
        <ResultBox label="Gain / Loss" value={formatSGD(gain)} positive={(parseFloat(currentPrice) || 0) >= (parseFloat(buyPrice) || 0)} />
        <ResultBox label="Return %" value={formatPct(pct)} positive={pct >= 0} />
      </div>
    </div>
  )
}

function CompoundCalc() {
  const [principal, setPrincipal] = useState('')
  const [rate, setRate] = useState('')
  const [years, setYears] = useState('')
  const [monthly, setMonthly] = useState('')

  const r = parseFloat(rate) / 100
  const p = parseFloat(principal) || 0
  const m = parseFloat(monthly) || 0
  const n = parseFloat(years) || 0

  // FV = P*(1+r)^n + M * ((1+r)^n - 1) / r
  const fv = isNaN(r) || r === 0
    ? p + m * 12 * n
    : p * Math.pow(1 + r, n) + m * 12 * ((Math.pow(1 + r, n) - 1) / r)

  const totalContributed = p + m * 12 * n
  const interest = fv - totalContributed

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40 leading-relaxed">Project your portfolio's future value with compound annual growth.</p>
      <CalcInput label="Starting Amount (SGD)" value={principal} onChange={setPrincipal} placeholder="e.g. 50000" />
      <CalcInput label="Annual Return Rate (%)" value={rate} onChange={setRate} placeholder="e.g. 7 for 7% p.a." />
      <CalcInput label="Years" value={years} onChange={setYears} placeholder="e.g. 20" />
      <CalcInput label="Monthly Contribution (SGD)" value={monthly} onChange={setMonthly} placeholder="e.g. 500 (optional)" />
      <div className="grid grid-cols-2 gap-3">
        <ResultBox label="Future Value" value={formatSGD(fv)} positive />
        <ResultBox label="Interest Earned" value={formatSGD(interest)} positive />
      </div>
    </div>
  )
}

// CPF interest rates (p.a.)
const CPF_RATES = { OA: 0.025, SA: 0.04, MA: 0.04 }

function cpfProject(oa, sa, ma, monthlyOA, monthlySA, monthlyMA, years) {
  let oaBal = oa, saBal = sa, maBal = ma
  for (let y = 0; y < years; y++) {
    oaBal = (oaBal + monthlyOA * 12) * (1 + CPF_RATES.OA)
    saBal = (saBal + monthlySA * 12) * (1 + CPF_RATES.SA)
    maBal = (maBal + monthlyMA * 12) * (1 + CPF_RATES.MA)
  }
  return { oaBal, saBal, maBal, total: oaBal + saBal + maBal }
}

function CPFCalc() {
  const [oaBalance, setOaBalance] = useState('')
  const [saBalance, setSaBalance] = useState('')
  const [maBalance, setMaBalance] = useState('')
  const [monthlyOA, setMonthlyOA] = useState('')
  const [monthlySA, setMonthlySA] = useState('')
  const [monthlyMA, setMonthlyMA] = useState('')
  const [years, setYears] = useState('10')

  const n = Math.max(0, parseInt(years) || 0)
  const result = cpfProject(
    parseFloat(oaBalance) || 0, parseFloat(saBalance) || 0, parseFloat(maBalance) || 0,
    parseFloat(monthlyOA) || 0, parseFloat(monthlySA) || 0, parseFloat(monthlyMA) || 0,
    n
  )
  // FRS 2025 ≈ SGD 213,000; BRS ≈ SGD 106,500
  const FRS = 213000

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40 leading-relaxed">Project your CPF balances using official interest rates: OA 2.5%, SA 4%, MA 4% p.a.</p>
      <div className="grid grid-cols-3 gap-2">
        <CalcInput label="OA Balance" value={oaBalance} onChange={setOaBalance} placeholder="0" />
        <CalcInput label="SA Balance" value={saBalance} onChange={setSaBalance} placeholder="0" />
        <CalcInput label="MA Balance" value={maBalance} onChange={setMaBalance} placeholder="0" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <CalcInput label="Mthly OA" value={monthlyOA} onChange={setMonthlyOA} placeholder="0" />
        <CalcInput label="Mthly SA" value={monthlySA} onChange={setMonthlySA} placeholder="0" />
        <CalcInput label="Mthly MA" value={monthlyMA} onChange={setMonthlyMA} placeholder="0" />
      </div>
      <CalcInput label="Projection Years" value={years} onChange={setYears} placeholder="e.g. 10" />
      <div className="grid grid-cols-2 gap-3">
        <ResultBox label={`OA in ${n}yr`} value={formatSGD(result.oaBal)} positive />
        <ResultBox label={`SA in ${n}yr`} value={formatSGD(result.saBal)} positive />
        <ResultBox label={`MA in ${n}yr`} value={formatSGD(result.maBal)} positive />
        <ResultBox label="Total CPF" value={formatSGD(result.total)} positive />
      </div>
      <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${result.saBal >= FRS ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-amber-500/20 bg-amber-500/5 text-amber-400'}`}>
        {result.saBal >= FRS
          ? `SA meets FRS (S$${(FRS / 1000).toFixed(0)}k) in ${n} years`
          : `SA shortfall vs FRS: ${formatSGD(FRS - result.saBal)} — consider voluntary top-ups`
        }
      </div>
    </div>
  )
}

function CalcInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="app-input mt-1.5 text-sm"
        step="any"
      />
    </label>
  )
}

function ResultBox({ label, value, positive }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-lg font-bold ${typeof positive === 'boolean' ? (positive ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

export default function CalculatorModal({ onClose }) {
  const [mode, setMode] = useState('position')

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-card w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10">
              <Calculator className="h-4 w-4 text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-white">Asset Calculator</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 border-b border-white/[0.06] px-4 py-3">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all duration-150 ${
                mode === m.key
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Calculator body */}
        <div className="p-6">
          {mode === 'position' && <PositionCalc />}
          {mode === 'return' && <ReturnCalc />}
          {mode === 'compound' && <CompoundCalc />}
          {mode === 'cpf' && <CPFCalc />}
        </div>
      </div>
    </div>,
    document.body
  )
}
