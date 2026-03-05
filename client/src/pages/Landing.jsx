import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, ArrowRight, BarChart3, Brain, Lock, TrendingUp, Wallet, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

// ── Atom Animation ────────────────────────────────────────────
const RINGS = [
  {
    angle: 0,
    speed: 9,
    dir: 'cw',
    nodes: [
      { symbol: '₿', label: 'BTC',   color: '#f7931a', bg: 'rgba(247,147,26,0.15)', delay: 0 },
      { symbol: '$',  label: 'Cash',  color: '#18a871', bg: 'rgba(24,168,113,0.15)', delay: -4.5 },
    ],
  },
  {
    angle: 60,
    speed: 13,
    dir: 'ccw',
    nodes: [
      { symbol: 'Ξ',   label: 'ETH',  color: '#627eea', bg: 'rgba(98,126,234,0.15)', delay: 0 },
      { symbol: 'CPF', label: 'CPF',  color: '#2f7cf6', bg: 'rgba(47,124,246,0.15)', delay: -6.5 },
    ],
  },
  {
    angle: -60,
    speed: 11,
    dir: 'cw',
    nodes: [
      { symbol: '🏦', label: 'Bank',   color: '#f0a100', bg: 'rgba(240,161,0,0.15)',  delay: 0 },
      { symbol: '📈', label: 'Stocks', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',  delay: -5.5 },
    ],
  },
]

const ORBIT_R = 82  // orbital radius (translateX distance)
const C = 120       // center of container

function AtomAnimation() {
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setMerging(true)
      const t = setTimeout(() => setMerging(false), 1500)
      return () => clearTimeout(t)
    }, 9000)
    return () => clearInterval(id)
  }, [])

  const NODE = 44  // symbol circle diameter

  return (
    <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
      {/* Subtle background glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(47,124,246,0.09) 0%, transparent 70%)',
          transform: merging ? 'scale(1.35)' : 'scale(1)',
          transition: 'transform 700ms ease',
        }}
      />

      {/* Orbital ring lines (SVG) */}
      <svg
        width="240"
        height="240"
        className="absolute inset-0"
        style={{ overflow: 'visible', pointerEvents: 'none' }}
      >
        {RINGS.map((ring) => (
          <ellipse
            key={ring.angle}
            cx={C}
            cy={C}
            rx={ORBIT_R}
            ry={32}
            fill="none"
            stroke="rgba(47,124,246,0.22)"
            strokeWidth="1"
            transform={`rotate(${ring.angle}, ${C}, ${C})`}
          />
        ))}
      </svg>

      {/* Orbiting symbol nodes */}
      {RINGS.map((ring) =>
        ring.nodes.map((node) => (
          <div
            key={`${ring.angle}-${node.label}`}
            style={{
              position: 'absolute',
              top: C - NODE / 2,
              left: C - NODE / 2,
              width: NODE,
              height: NODE,
              transformOrigin: `${NODE / 2}px ${NODE / 2}px`,
              transform: `rotate(${ring.angle}deg)`,
            }}
          >
            <div
              style={{
                width: NODE,
                height: NODE,
                transformOrigin: `${NODE / 2}px ${NODE / 2}px`,
                animation: `orbit-${ring.dir} ${ring.speed}s linear infinite`,
                animationDelay: `${node.delay}s`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: NODE,
                  height: NODE,
                  transform: `translateX(${ORBIT_R}px) rotate(${-ring.angle}deg)`,
                  opacity: merging ? 0 : 1,
                  scale: merging ? '0.2' : '1',
                  transition: 'opacity 400ms ease, scale 400ms ease',
                }}
              >
                <div
                  className="flex items-center justify-center text-sm font-bold shadow-lg"
                  style={{
                    width: NODE,
                    height: NODE,
                    borderRadius: '50%',
                    background: node.bg,
                    border: `1.5px solid ${node.color}55`,
                    color: node.color,
                    fontSize: node.symbol.length > 1 ? '10px' : '16px',
                    fontFamily: 'ui-monospace, monospace',
                    boxShadow: `0 0 14px ${node.color}35, 0 2px 8px rgba(0,0,0,0.3)`,
                  }}
                >
                  {node.symbol}
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Center shield — circular */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          width: 82,
          height: 82,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2f7cf6 0%, #06b6d4 100%)',
          boxShadow: merging
            ? '0 0 0 10px rgba(47,124,246,0.16), 0 0 55px rgba(47,124,246,0.65), 0 0 90px rgba(6,182,212,0.28)'
            : '0 0 0 5px rgba(47,124,246,0.10), 0 0 28px rgba(47,124,246,0.38)',
          transform: merging ? 'scale(1.18)' : 'scale(1)',
          transition: 'transform 500ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 500ms ease',
        }}
      >
        <Shield className="h-9 w-9 text-white" strokeWidth={1.5} />
      </div>
    </div>
  )
}

// ── Stats counter ─────────────────────────────────────────────
function useCountUp(target, duration = 900, start = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime = null
    function step(ts) {
      if (!startTime) startTime = ts
      const p = Math.min((ts - startTime) / duration, 1)
      setCount(Math.floor(p * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration, start])
  return count
}

function StatCounter({ value, suffix, label, start }) {
  const count = useCountUp(value, 900, start)
  return (
    <div className="text-center">
      <p className="text-2xl font-bold gradient-text">{count}{suffix}</p>
      <p className="text-[11px] text-white/35 mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  )
}

// ── Landing ───────────────────────────────────────────────────
const initialForm = { username: '', email: '', password: '' }

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, register, user } = useAuth()
  const [mode, setMode] = useState('login')
  const [showForm, setShowForm] = useState(false)
  const [values, setValues] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [statsVisible, setStatsVisible] = useState(false)
  const statsRef = useRef(null)

  const redirectTarget = location.state?.from || '/dashboard'

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true) },
      { threshold: 0.2 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  function openForm(m) {
    setMode(m)
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setError('')
    setValues(initialForm)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      setError('')
      if (mode === 'login') await login(values)
      else await register(values)
      navigate(redirectTarget, { replace: true })
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const stats = [
    { label: 'Asset Categories', value: 8, suffix: '' },
    { label: 'Wellness Factors', value: 4, suffix: '' },
    { label: 'Live Price APIs', value: 3, suffix: '' },
    { label: 'Built for SG',   value: 100, suffix: '%' },
  ]

  const features = [
    { icon: BarChart3,   title: 'Unified Wealth View',    desc: 'Stocks, crypto, property, CPF — one dashboard with live pricing.',          color: '#2f7cf6' },
    { icon: Sparkles,    title: 'AI Financial Advisor',   desc: 'WealthAI gives personalised guidance on your portfolio.',                    color: '#a78bfa' },
    { icon: Brain,       title: 'Smart Insights',         desc: 'Data-driven recommendations to optimise diversification and liquidity.',     color: '#18a871' },
    { icon: Lock,        title: 'Private & Secure',       desc: 'Each account is isolated — your data never leaves your session.',            color: '#f0a100' },
    { icon: Wallet,      title: 'Multi-Asset Connect',    desc: 'Link Singpass, banks, and crypto wallets to auto-import holdings.',          color: '#e05e00' },
    { icon: ShieldCheck, title: 'SGD-Native',             desc: 'All values in SGD with CPF, SGX, and local bank support built-in.',          color: '#06b6d4' },
  ]

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: 'linear-gradient(160deg, #05091a 0%, #090e1e 55%, #050918 100%)' }}
    >
      {/* Subtle center glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 38%, rgba(47,124,246,0.09) 0%, transparent 100%)',
        }}
      />

      {/* ── Nav ────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-cyan-400 shadow-md shadow-accent/20">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-white/70 tracking-tight">SafeSeven</span>
        </Link>
        {isAuthenticated && (
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent font-medium hover:bg-accent/15 transition-colors"
          >
            Continue as {user?.username} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 pt-4 pb-20">

        {/* Atom */}
        <AtomAnimation />

        {/* Title */}
        <h1 className="text-5xl font-bold tracking-tight mt-10 mb-2">
          <span className="text-white">SafeSeven</span>
        </h1>
        <p className="text-sm text-white/38 max-w-xs leading-relaxed mb-8">
          Your total wealth — unified, intelligent, and always in your hands.
        </p>

        {/* ── Auth ─────────────────────────────────────────── */}
        <div className="w-full max-w-[320px]">
          {!showForm ? (
            /* Collapsed: just two buttons */
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => openForm('login')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-shadow"
                style={{ background: 'linear-gradient(135deg, #2f7cf6 0%, #06b6d4 100%)' }}
              >
                Sign In <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => openForm('register')}
                className="text-xs text-white/35 hover:text-white/60 transition-colors"
              >
                New to SafeSeven? <span className="text-accent font-semibold">Create account</span>
              </button>
            </div>
          ) : (
            /* Expanded form */
            <div
              className="rounded-3xl border p-5 relative"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Close */}
              <button
                onClick={closeForm}
                className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {/* Mode toggle */}
              <div className="flex items-center gap-1 mb-4">
                <button
                  onClick={() => setMode('login')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    mode === 'login'
                      ? 'bg-accent/15 text-accent'
                      : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('register')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    mode === 'register'
                      ? 'bg-accent/15 text-accent'
                      : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  Register
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-2.5">
                <input
                  value={values.username}
                  onChange={e => setValues(c => ({ ...c, username: e.target.value }))}
                  className="app-input text-sm py-3"
                  placeholder="Username"
                  autoComplete="username"
                  autoFocus
                />

                {mode === 'register' && (
                  <input
                    type="email"
                    value={values.email}
                    onChange={e => setValues(c => ({ ...c, email: e.target.value }))}
                    className="app-input text-sm py-3"
                    placeholder="Email (optional)"
                  />
                )}

                <input
                  type="password"
                  value={values.password}
                  onChange={e => setValues(c => ({ ...c, password: e.target.value }))}
                  className="app-input text-sm py-3"
                  placeholder="Password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white shadow-md shadow-accent/20 hover:shadow-accent/35 transition-shadow disabled:opacity-60 mt-1"
                  style={{ background: 'linear-gradient(135deg, #2f7cf6 0%, #06b6d4 100%)' }}
                >
                  {isSubmitting ? 'Working…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <p className="mt-3 text-[10px] text-white/20 text-center">
                New accounts start with a sample portfolio ready immediately.
              </p>
            </div>
          )}
        </div>

        {/* Trust row */}
        <div className="mt-7 flex items-center gap-6 flex-wrap justify-center">
          {[
            { icon: TrendingUp, label: 'Yahoo Finance + CoinGecko' },
            { icon: ShieldCheck, label: 'Private · Local · Secure' },
            { icon: Wallet,     label: 'CPF · Stocks · Crypto' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[11px] text-white/22">
              <Icon className="h-3.5 w-3.5 text-accent/45" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Below fold ─────────────────────────────────────── */}
      <div
        className="relative z-10 border-t px-6 py-14"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.22)' }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Stats */}
          <div
            ref={statsRef}
            className="grid grid-cols-4 gap-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-5 backdrop-blur-sm mb-10"
          >
            {stats.map(s => (
              <StatCounter key={s.label} value={s.value} suffix={s.suffix} label={s.label} start={statsVisible} />
            ))}
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.10] hover:bg-white/[0.05] hover:-translate-y-0.5"
              >
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}18` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <h3 className="text-sm font-semibold text-white/85 mb-1">{title}</h3>
                <p className="text-xs text-white/35 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-[11px] text-white/18">
            SafeSeven · NTU FinTech Hackathon 2026 · Schroders Wealth Wellness Hub
          </p>
        </div>
      </div>
    </div>
  )
}
