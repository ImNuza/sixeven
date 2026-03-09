import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAsset } from '../services/api'
import {
  TrendingUp, Bitcoin, Building2, Shield, Banknote, BarChart2, ArrowRight,
  ChevronRight, ChevronLeft, Sparkles, Star,
} from 'lucide-react'

// ── Palette ──────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C'
const GOLD2 = '#F0D080'
const DARK  = '#080B1A'

// ── Survey questions ──────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 'crypto',
    icon: Bitcoin,
    color: '#F7931A',
    category: 'CRYPTO',
    label: 'Crypto',
    question: 'Do you own any cryptocurrency?',
    sub: 'Think Bitcoin, Ethereum, or any altcoins.',
    followUp: 'Roughly how much is your crypto portfolio worth today? (SGD)',
    placeholder: 'e.g. 12000',
    skipLabel: 'No crypto',
  },
  {
    id: 'stocks',
    icon: TrendingUp,
    color: '#10B981',
    category: 'STOCKS',
    label: 'Stocks',
    question: 'Do you invest in stocks or ETFs?',
    sub: 'Including SGX-listed, US equities, unit trusts, or robo-advisors.',
    followUp: 'What is the current market value of your stock/ETF holdings? (SGD)',
    placeholder: 'e.g. 45000',
    skipLabel: 'No stocks',
  },
  {
    id: 'property',
    icon: Building2,
    color: '#8B5CF6',
    category: 'PROPERTY',
    label: 'Property',
    question: 'Do you own any property?',
    sub: 'HDB flat, condo, landed, or overseas real estate.',
    followUp: 'What is the estimated current value of your property? (SGD)',
    placeholder: 'e.g. 650000',
    skipLabel: 'No property',
  },
  {
    id: 'cpf',
    icon: Shield,
    color: '#06B6D4',
    category: 'CPF',
    label: 'CPF / Retirement',
    question: 'Do you have CPF savings?',
    sub: 'Ordinary Account, Special Account, or MediSave.',
    followUp: 'What is your approximate total CPF balance across all accounts? (SGD)',
    placeholder: 'e.g. 80000',
    skipLabel: 'Skip CPF',
  },
  {
    id: 'cash',
    icon: Banknote,
    color: '#22C55E',
    category: 'CASH',
    label: 'Cash & Savings',
    question: 'How much cash and savings do you have?',
    sub: 'Bank accounts, fixed deposits, SSBs, T-bills.',
    followUp: 'Total liquid savings you\'d like to track? (SGD)',
    placeholder: 'e.g. 30000',
    skipLabel: 'Skip',
  },
  {
    id: 'bonds',
    icon: BarChart2,
    color: '#F59E0B',
    category: 'BONDS',
    label: 'Bonds',
    question: 'Do you hold any bonds or fixed income?',
    sub: 'Corporate bonds, Singapore Savings Bonds, REITs.',
    followUp: 'Approximate value of your bond/fixed income holdings? (SGD)',
    placeholder: 'e.g. 20000',
    skipLabel: 'No bonds',
  },
]

// ── Wellness calculation ──────────────────────────────────────────────────────
function calcScore(answers) {
  const total = Object.values(answers).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  let score = 0
  const cats = Object.keys(answers).filter(k => parseFloat(answers[k]) > 0)

  // Diversification (up to 40 pts)
  score += Math.min(cats.length * 7, 40)

  // Net worth tier (up to 35 pts)
  if (total >= 1000000) score += 35
  else if (total >= 500000) score += 28
  else if (total >= 200000) score += 22
  else if (total >= 100000) score += 16
  else if (total >= 50000)  score += 10
  else if (total >= 10000)  score += 5

  // CPF bonus (up to 15 pts)
  if (parseFloat(answers.cpf) > 0) score += 10
  if (parseFloat(answers.cpf) >= 50000) score += 5

  // Emergency fund proxy — cash (up to 10 pts)
  if (parseFloat(answers.cash) >= 20000) score += 10
  else if (parseFloat(answers.cash) >= 5000) score += 5

  return Math.min(score, 100)
}

function scoreLabel(score) {
  if (score >= 80) return { label: 'Excellent', color: '#10B981' }
  if (score >= 60) return { label: 'Good',      color: GOLD }
  if (score >= 40) return { label: 'Fair',       color: '#F59E0B' }
  return              { label: 'Needs Work',  color: '#EF4444' }
}

// ── Projection chart (canvas) ─────────────────────────────────────────────────
function ProjectionCanvas({ total }) {
  const canvasRef = useRef(null)
  const HORIZONS = [5, 10, 20, 30]
  const RATE = 0.07 // 7% avg annual growth

  function fv(pv, n) { return pv * Math.pow(1 + RATE, n) }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const pts = [0, ...HORIZONS].map(n => ({ x: n, y: total > 0 ? fv(total, n) : 0 }))
    const maxY = Math.max(...pts.map(p => p.y), 1)
    const pad = { t: 24, r: 20, b: 36, l: 56 }
    const cw = W - pad.l - pad.r
    const ch = H - pad.t - pad.b

    function mapX(x) { return pad.l + (x / 30) * cw }
    function mapY(y) { return pad.t + ch - (y / maxY) * ch }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke()
    }

    // Area gradient
    const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b)
    grad.addColorStop(0, 'rgba(201,168,76,0.28)')
    grad.addColorStop(1, 'rgba(201,168,76,0.00)')
    ctx.beginPath()
    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y))
    pts.slice(1).forEach(p => ctx.lineTo(mapX(p.x), mapY(p.y)))
    ctx.lineTo(mapX(pts[pts.length - 1].x), mapY(0))
    ctx.lineTo(mapX(pts[0].x), mapY(0))
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Line
    ctx.beginPath()
    ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y))
    pts.slice(1).forEach(p => ctx.lineTo(mapX(p.x), mapY(p.y)))
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Dots + labels
    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(mapX(p.x), mapY(p.y), 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? 'rgba(201,168,76,0.5)' : GOLD
      ctx.fill()

      if (i > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = '700 10px system-ui'
        ctx.textAlign = 'center'
        const label = p.y >= 1e6
          ? `S$${(p.y / 1e6).toFixed(1)}M`
          : `S$${(p.y / 1000).toFixed(0)}k`
        ctx.fillText(label, mapX(p.x), mapY(p.y) - 10)

        // X axis label
        ctx.fillStyle = 'rgba(255,255,255,0.38)'
        ctx.font = '10px system-ui'
        ctx.fillText(`${p.x}yr`, mapX(p.x), H - pad.b + 16)
      }
    })

    // Y axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.font = '9px system-ui'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = (maxY / 4) * (4 - i)
      const label = val >= 1e6 ? `${(val / 1e6).toFixed(1)}M` : `${(val / 1000).toFixed(0)}k`
      ctx.fillText(label, pad.l - 6, pad.t + (ch / 4) * i + 3)
    }
  }, [total])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '180px', display: 'block' }} />
}

// ── Star field background ─────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth || window.innerWidth
    const H = canvas.offsetHeight || window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.4 + 0.2,
      a: Math.random() * 0.7 + 0.15,
    }))
    stars.forEach(s => {
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${s.a})`
      ctx.fill()
    })
  }, [])
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)   // 0 = welcome, 1..N = questions, N+1 = score
  const [phase, setPhase] = useState('ask')  // 'ask' | 'input'
  const [answers, setAnswers] = useState({}) // { crypto: '12000', stocks: '', ... }
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [visible, setVisible] = useState(true)

  const total = QUESTIONS.length
  const isWelcome = step === 0
  const isScore = step === total + 1
  const q = !isWelcome && !isScore ? QUESTIONS[step - 1] : null

  const netWorth = Object.values(answers).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const score = calcScore(answers)
  const { label: scoreStatus, color: scoreColor } = scoreLabel(score)

  function transition(fn) {
    setVisible(false)
    setTimeout(() => { fn(); setVisible(true) }, 280)
  }

  function back() {
    if (isScore) { transition(() => { setStep(total); setPhase('ask') }); return }
    if (phase === 'input') { transition(() => setPhase('ask')); return }
    if (step > 1) { transition(() => { setStep(s => s - 1); setPhase('ask'); setInputVal('') }); return }
    if (step === 1) { transition(() => setStep(0)) }
  }

  function next() {
    if (isWelcome) { transition(() => setStep(1)); return }

    if (phase === 'ask') {
      // User said YES to this question → show amount input
      transition(() => setPhase('input'))
      return
    }

    // Save input and advance
    const key = q.id
    const val = inputVal.trim()
    setAnswers(prev => ({ ...prev, [key]: val || '0' }))
    setInputVal('')
    if (step < total) {
      transition(() => { setStep(s => s + 1); setPhase('ask') })
    } else {
      transition(() => setStep(total + 1))
    }
  }

  function skip() {
    const key = q.id
    setAnswers(prev => ({ ...prev, [key]: '0' }))
    if (step < total) {
      transition(() => { setStep(s => s + 1); setPhase('ask') })
    } else {
      transition(() => setStep(total + 1))
    }
  }

  async function goToDashboard() {
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      // Category-specific details required by server validation
      const detailsFor = {
        CPF: { accountType: 'Combined' },
        PROPERTY: { address: 'Singapore' },
        BONDS: { issuer: 'Various', maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
      }
      await Promise.all(
        QUESTIONS
          .filter(q => parseFloat(answers[q.id]) > 0)
          .map(q =>
            createAsset({
              name: q.label,
              category: q.category,
              value: parseFloat(answers[q.id]),
              cost: parseFloat(answers[q.id]),
              quantity: 1,
              date: today,
              institution: 'Onboarding',
              ...(detailsFor[q.category] ? { details: detailsFor[q.category] } : {}),
            }).catch(() => null)
          )
      )
    } catch (_) {}
    navigate('/dashboard', { replace: true })
  }

  const Icon = q?.icon

  return (
    <div style={{
      minHeight: '100vh', background: DARK, color: '#fff',
      fontFamily: "'SF Pro Display','SF Pro Text',ui-sans-serif,system-ui,-apple-system,sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem 1rem', position: 'relative', overflow: 'hidden',
    }}>
      <StarField />

      {/* Gold ambient glow */}
      <div style={{
        position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)',
        width: '80vw', height: '60vh', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: '560px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}>
        {/* ── Welcome step ── */}
        {isWelcome && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: `radial-gradient(circle at 40% 35%, ${GOLD2}, ${GOLD})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 2rem', boxShadow: `0 0 40px rgba(201,168,76,0.35)`,
            }}>
              <Sparkles size={32} color={DARK} strokeWidth={2} />
            </div>
            <p style={{ fontSize: '0.75rem', letterSpacing: '0.22em', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              WEALTH WELLNESS HUB
            </p>
            <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Let's build your<br />
              <span style={{ color: GOLD }}>financial picture</span>
            </h1>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.56)', lineHeight: 1.65, marginBottom: '2.5rem', maxWidth: 420, margin: '0 auto 2.5rem' }}>
              We'll ask you a few quick questions about your assets. It takes about 2 minutes and helps us personalise your wellness score.
            </p>
            <button onClick={next} style={btnStyle(GOLD, DARK)}>
              Get started <ArrowRight size={16} />
            </button>
            <button onClick={() => navigate('/dashboard', { replace: true })} style={{ marginTop: '1rem', display: 'block', marginInline: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.32)', fontSize: '0.8rem', cursor: 'pointer' }}>
              Skip for now
            </button>
          </div>
        )}

        {/* ── Question steps ── */}
        {q && (
          <div>
            {/* Back + progress row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <button onClick={back} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0' }}>
                <ChevronLeft size={15} /> Back
              </button>
              {/* Progress dots */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {QUESTIONS.map((_, i) => (
                  <div key={i} style={{
                    width: i === step - 1 ? 24 : 8, height: 8, borderRadius: 4,
                    background: i < step - 1 ? GOLD : i === step - 1 ? GOLD : 'rgba(255,255,255,0.12)',
                    opacity: i <= step - 1 ? 1 : 0.4,
                    transition: 'width 300ms ease, background 300ms ease',
                  }} />
                ))}
              </div>
            </div>

            {/* Question card */}
            <div style={{
              background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '2rem', padding: '2.5rem 2rem', backdropFilter: 'blur(20px)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
            }}>
              {/* Icon */}
              <div style={{
                width: 56, height: 56, borderRadius: '1.25rem',
                background: `${q.color}18`, border: `1px solid ${q.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1.5rem',
              }}>
                <Icon size={26} color={q.color} strokeWidth={1.8} />
              </div>

              {phase === 'ask' ? (
                <>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                    {step} of {total}
                  </p>
                  <h2 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.75rem)', fontWeight: 700, lineHeight: 1.3, marginBottom: '0.75rem' }}>
                    {q.question}
                  </h2>
                  <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                    {q.sub}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={next} style={btnStyle(GOLD, DARK, true)}>
                      Yes, I do <ChevronRight size={16} />
                    </button>
                    <button onClick={skip} style={btnStyleOutline()}>
                      {q.skipLabel}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2em', color: q.color, textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                    {q.label}
                  </p>
                  <h2 style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)', fontWeight: 700, lineHeight: 1.35, marginBottom: '1.5rem' }}>
                    {q.followUp}
                  </h2>
                  <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                    <span style={{
                      position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
                      color: 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: '1rem', pointerEvents: 'none',
                    }}>S$</span>
                    <input
                      autoFocus
                      type="number"
                      value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && next()}
                      placeholder={q.placeholder}
                      style={{
                        width: '100%', borderRadius: '1rem',
                        border: `1.5px solid rgba(255,255,255,0.1)`,
                        background: 'rgba(255,255,255,0.05)', color: '#fff',
                        padding: '0.9rem 1rem 0.9rem 2.5rem', fontSize: '1.1rem',
                        fontFamily: 'inherit', outline: 'none',
                        transition: 'border-color 180ms',
                      }}
                      onFocus={e => { e.target.style.borderColor = GOLD }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={next} style={btnStyle(GOLD, DARK, true)}>
                      Continue <ChevronRight size={16} />
                    </button>
                    <button onClick={skip} style={btnStyleOutline()}>
                      Skip
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Score reveal ── */}
        {isScore && (
          <div style={{ textAlign: 'center' }}>
            {/* Score ring */}
            <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 2rem' }}>
              <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                <circle
                  cx="80" cy="80" r="68" fill="none"
                  stroke={scoreColor} strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 68}`}
                  strokeDashoffset={`${2 * Math.PI * 68 * (1 - score / 100)}`}
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '2.4rem', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}</span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>/ 100</span>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', letterSpacing: '0.22em', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              YOUR WELLNESS SCORE
            </p>
            <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 800, marginBottom: '0.5rem' }}>
              <span style={{ color: scoreColor }}>{scoreStatus}</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Portfolio tracked: <strong style={{ color: GOLD }}>
                {new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(netWorth)}
              </strong>
            </p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem', marginBottom: '2.5rem' }}>
              Based on {Object.values(answers).filter(v => parseFloat(v) > 0).length} asset {Object.values(answers).filter(v => parseFloat(v) > 0).length === 1 ? 'class' : 'classes'}
            </p>

            {/* Breakdown chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
              {QUESTIONS.filter(q => parseFloat(answers[q.id]) > 0).map(q => (
                <div key={q.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: `${q.color}12`, border: `1px solid ${q.color}28`,
                  borderRadius: '999px', padding: '0.35rem 0.8rem', fontSize: '0.78rem', color: q.color,
                }}>
                  <q.icon size={12} strokeWidth={2} />
                  {q.label}
                </div>
              ))}
            </div>

            {/* Projection */}
            {netWorth > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '1.5rem', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'left',
              }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '1rem' }}>
                  Investment Projection @ 7% p.a.
                </p>
                <ProjectionCanvas total={netWorth} />
                <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.24)', marginTop: '0.5rem' }}>
                  Illustrative only. Based on 7% average annual growth, compounded. Past performance is not indicative of future returns.
                </p>
              </div>
            )}

            {/* Score tips */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '1.5rem', padding: '1.25rem 1.5rem', marginBottom: '2rem', textAlign: 'left',
            }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Quick wins to improve your score
              </p>
              {getTips(answers).map((tip, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: i < getTips(answers).length - 1 ? '0.6rem' : 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Star size={10} color={GOLD} fill={GOLD} />
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{tip}</p>
                </div>
              ))}
            </div>

            <button onClick={goToDashboard} disabled={saving} style={btnStyle(GOLD, DARK)}>
              {saving ? 'Saving…' : 'Here are steps to elevate your wellness health!'}
              {!saving && <ArrowRight size={16} />}
            </button>
            <button onClick={back} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', cursor: 'pointer' }}>
              <ChevronLeft size={14} /> Edit my answers
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper style functions ────────────────────────────────────────────────────
function btnStyle(bg, color, flex = false) {
  return {
    display: flex ? 'inline-flex' : 'inline-flex',
    alignItems: 'center', gap: '0.5rem',
    background: `linear-gradient(135deg, ${GOLD2} 0%, ${bg} 100%)`,
    color, fontWeight: 700, fontSize: '0.9rem',
    padding: '0.85rem 1.8rem', borderRadius: '1rem',
    border: 'none', cursor: 'pointer',
    boxShadow: `0 8px 24px rgba(201,168,76,0.28)`,
    transition: 'transform 120ms, box-shadow 120ms',
  }
}

function btnStyleOutline() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)',
    fontWeight: 600, fontSize: '0.85rem',
    padding: '0.85rem 1.4rem', borderRadius: '1rem',
    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
    transition: 'background 150ms',
  }
}

function getTips(answers) {
  const tips = []
  const cats = QUESTIONS.filter(q => parseFloat(answers[q.id]) > 0).length

  if (cats < 3) tips.push('Diversify across at least 3 asset classes to reduce concentration risk.')
  if (!parseFloat(answers.cpf)) tips.push('Consider making voluntary CPF top-ups — SA earns 4% p.a. guaranteed.')
  if ((parseFloat(answers.cash) || 0) < 20000) tips.push('Build an emergency fund of at least 6 months of expenses in cash.')
  if (!parseFloat(answers.stocks) && !parseFloat(answers.bonds)) tips.push('Investing in equities or bonds can grow wealth above inflation over time.')
  if (tips.length === 0) tips.push('Keep up the great work! Review your allocations quarterly and rebalance as needed.')
  return tips.slice(0, 3)
}
