import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, ArrowRight, BarChart3, Brain, Lock, TrendingUp, Wallet, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

// ── Interactive data globe ────────────────────────────────────
const DATA_LABELS = [
  'SGD', 'BTC', 'ETH', 'CPF', 'REITs', 'S&P 500', 'DBS', 'NVDA',
  'Gold', 'Bonds', 'USD', 'AAPL', 'MSFT', 'UOB', 'SIA', 'GLD',
  'Cash', 'Property', 'EM Debt', 'T-Bills',
]

function DataGlobe() {
  const canvasRef = useRef(null)
  const mouse = useRef({ x: 0, y: 0, hover: false })
  const state = useRef({ rotX: 0.3, rotY: 0, velX: 0.0008, velY: 0.0014, pulse: 0 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const R = Math.min(W, H) * 0.38
    const edgeDist = R * 0.48

    const { rotX, rotY } = state.current
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX)
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY)

    function project(x, y, z) {
      const x1 = x * cosY + z * sinY
      const z1 = -x * sinY + z * cosY
      const y2 = y * cosX - z1 * sinX
      const z2 = y * sinX + z1 * cosX
      return { sx: cx + x1, sy: cy + y2, depth: (z2 + R) / (R * 2) }
    }

    ctx.clearRect(0, 0, W, H)

    const pts = canvas._particles.map((p) => {
      const r = R + Math.sin(state.current.pulse + p.phase) * (R * 0.038)
      const x = r * Math.sin(p.theta) * Math.cos(p.phi)
      const y = r * Math.cos(p.theta)
      const z = r * Math.sin(p.theta) * Math.sin(p.phi)
      return { ...project(x, y, z), label: p.label }
    })

    // Draw edges
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].sx - pts[j].sx
        const dy = pts[i].sy - pts[j].sy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < edgeDist) {
          const alpha = (1 - dist / edgeDist) * 0.28 * ((pts[i].depth + pts[j].depth) / 2)
          ctx.beginPath()
          ctx.moveTo(pts[i].sx, pts[i].sy)
          ctx.lineTo(pts[j].sx, pts[j].sy)
          ctx.strokeStyle = `rgba(71,158,255,${alpha})`
          ctx.lineWidth = 0.8
          ctx.stroke()
        }
      }
    }

    // Draw nodes & labels (back-to-front)
    const nodeScale = R / 130
    pts
      .slice()
      .sort((a, b) => a.depth - b.depth)
      .forEach((pt) => {
        const r = (pt.depth * 3.5 + 1) * nodeScale
        const alpha = pt.depth * 0.75 + 0.15

        ctx.beginPath()
        ctx.arc(pt.sx, pt.sy, r + 2 * nodeScale, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(47,124,246,${alpha * 0.25})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2)
        const grad = ctx.createRadialGradient(pt.sx - r * 0.3, pt.sy - r * 0.3, 0, pt.sx, pt.sy, r)
        grad.addColorStop(0, `rgba(120,200,255,${alpha})`)
        grad.addColorStop(1, `rgba(47,124,246,${alpha * 0.6})`)
        ctx.fillStyle = grad
        ctx.fill()

        if (pt.label && pt.depth > 0.52) {
          const fontSize = Math.round((pt.depth * 7 + 7) * nodeScale)
          ctx.font = `${fontSize}px ui-monospace, monospace`
          ctx.fillStyle = `rgba(160,210,255,${(pt.depth - 0.52) * 1.8})`
          ctx.fillText(pt.label, pt.sx + r + 3, pt.sy + fontSize * 0.38)
        }
      })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const N = 140
    canvas._particles = Array.from({ length: N }, (_, i) => ({
      theta: Math.acos(2 * Math.random() - 1),
      phi: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      label: i < DATA_LABELS.length ? DATA_LABELS[i] : null,
    }))

    window.addEventListener('resize', resize)

    let raf
    function tick() {
      const s = state.current
      const m = mouse.current
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2

      s.pulse += 0.018

      if (m.hover) {
        const targetVelX = (m.y - cy) / cy * 0.005
        const targetVelY = (m.x - cx) / cx * 0.005
        s.velX += (targetVelX - s.velX) * 0.08
        s.velY += (targetVelY - s.velY) * 0.08
      } else {
        s.velX += (0.0008 - s.velX) * 0.04
        s.velY += (0.0014 - s.velY) * 0.04
      }

      s.rotX += s.velX
      s.rotY += s.velY

      draw()
      raf = requestAnimationFrame(tick)
    }

    tick()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [draw])

  function handleMouseMove(e) {
    mouse.current = { x: e.clientX, y: e.clientY, hover: true }
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouse.current = { ...mouse.current, hover: false } }}
    />
  )
}

const features = [
  {
    icon: BarChart3,
    title: 'Unified Wealth View',
    desc: 'Aggregate all your assets — stocks, crypto, property, CPF — into a single dashboard.',
    color: '#2f7cf6',
  },
  {
    icon: Brain,
    title: 'AI-Powered Insights',
    desc: 'Get personalized, data-driven recommendations to optimize your financial wellness.',
    color: '#18a871',
  },
  {
    icon: Lock,
    title: 'Private Accounts',
    desc: 'Each SafeSeven account stores its own portfolio, snapshots, and credentials securely.',
    color: '#f0a100',
  },
]

const stats = [
  { label: 'Asset Categories', value: 8, suffix: '' },
  { label: 'Wellness Factors', value: 4, suffix: '' },
  { label: 'Live Price APIs', value: 3, suffix: '' },
  { label: 'Built for SG', value: 100, suffix: '%' },
]

function useCountUp(target, duration = 1200, start = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime = null
    function step(timestamp) {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      setCount(Math.floor(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration, start])
  return count
}

function StatCounter({ value, suffix, label, start }) {
  const count = useCountUp(value, 1000, start)
  return (
    <div className="text-center">
      <p className="text-3xl font-bold gradient-text">{count}{suffix}</p>
      <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  )
}

const initialForm = { username: '', email: '', password: '' }

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, register, user } = useAuth()
  const [mode, setMode] = useState('login')
  const [values, setValues] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [statsVisible, setStatsVisible] = useState(false)
  const statsRef = useRef(null)

  const redirectTarget = location.state?.from || '/dashboard'

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true) },
      { threshold: 0.3 }
    )
    if (statsRef.current) observer.observe(statsRef.current)
    return () => observer.disconnect()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      setError('')
      if (mode === 'login') {
        await login(values)
      } else {
        await register(values)
      }
      navigate(redirectTarget, { replace: true })
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #060b18 0%, #0b1020 50%, #060d1a 100%)' }}>

      {/* ── Full-screen interactive globe ────────────────────── */}
      <div className="fixed inset-0 z-0 opacity-[0.22]">
        <DataGlobe />
      </div>

      {/* ── Animated background orbs ─────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
        <div className="landing-orb landing-orb-1" />
        <div className="landing-orb landing-orb-2" />
        <div className="landing-orb landing-orb-3" />
        <div className="landing-orb landing-orb-4" />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: 'linear-gradient(rgba(47,124,246,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(47,124,246,0.8) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between border-b border-white/[0.04] px-8 py-5">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-400 shadow-lg shadow-accent/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">SafeSeven</span>
        </Link>
        {isAuthenticated ? (
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent font-medium hover:bg-accent/15 transition-colors"
          >
            Continue as {user?.username}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="text-sm text-white/30 font-medium">SGD-native portfolio intelligence</span>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto max-w-7xl px-8 pt-16 pb-20">
        <div className="grid grid-cols-[1.15fr_0.85fr] items-start gap-16">

          {/* Left: copy */}
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              NTU FinTech Hackathon 2026 · Schroders Challenge
            </div>

            <h1 className="text-6xl font-semibold leading-tight tracking-tight">
              <span className="text-white">Your Total Wealth.</span>
              <br />
              <span className="gradient-text">Clearer. Calmer.</span>
              <br />
              <span className="gradient-text">Healthier.</span>
            </h1>

            <p className="text-lg text-white/40 max-w-lg mt-6 leading-relaxed">
              SafeSeven unifies traditional and digital assets into a single wellness dashboard with
              live market pricing, portfolio analytics, and account-based private storage.
            </p>

            {/* CTA row */}
            <div className="mt-8 flex items-center gap-4">
              <Link
                to="/"
                onClick={() => document.querySelector('#auth-form')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-shadow"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-2 text-sm text-white/35">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Private · Local · Secure
              </div>
            </div>

            {/* Live stats counters */}
            <div ref={statsRef} className="mt-12 grid grid-cols-4 gap-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-5 backdrop-blur-sm">
              {stats.map((s) => (
                <StatCounter key={s.label} value={s.value} suffix={s.suffix} label={s.label} start={statsVisible} />
              ))}
            </div>

            {/* Feature cards */}
            <div className="mt-10 grid grid-cols-3 gap-4">
              {features.map(({ icon: Icon, title, desc, color }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.06] hover:-translate-y-0.5"
                >
                  <div
                    className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}18` }}
                  >
                    <Icon className="h-4.5 w-4.5" style={{ color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-white/85 mb-1.5">{title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            {/* Trust badges */}
            <div className="mt-8 flex items-center gap-6">
              {[
                { icon: TrendingUp, label: 'Yahoo Finance + CoinGecko' },
                { icon: Wallet, label: 'CPF, Stocks, Crypto, Property' },
                { icon: ShieldCheck, label: 'HMAC-SHA256 Auth' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-white/30">
                  <Icon className="h-3.5 w-3.5 text-accent/60" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: auth form */}
          <div id="auth-form" className="sticky top-16">

            <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.04] p-7 backdrop-blur-2xl shadow-2xl shadow-black/40">
              {/* Subtle glow behind the card */}
              <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-accent/10 to-cyan-500/5" />

              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/35 mb-1.5">Account Access</p>
                    <h2 className="text-xl font-semibold text-white">
                      {mode === 'login' ? 'Sign in to your portfolio' : 'Create your account'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMode((c) => (c === 'login' ? 'register' : 'login')); setError('') }}
                    className="text-xs text-accent font-semibold border border-accent/20 bg-accent/8 rounded-xl px-3 py-1.5 hover:bg-accent/15 transition-colors"
                  >
                    {mode === 'login' ? 'Register' : 'Sign In'}
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Username</span>
                    <input
                      value={values.username}
                      onChange={(e) => setValues((c) => ({ ...c, username: e.target.value }))}
                      className="app-input mt-2 text-sm"
                      placeholder="your-username"
                      autoComplete="username"
                    />
                  </label>

                  {mode === 'register' && (
                    <label className="block">
                      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Recovery Email <span className="text-white/20 normal-case font-normal">(optional)</span></span>
                      <input
                        type="email"
                        value={values.email}
                        onChange={(e) => setValues((c) => ({ ...c, email: e.target.value }))}
                        className="app-input mt-2 text-sm"
                        placeholder="you@example.com"
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Password</span>
                    <input
                      type="password"
                      value={values.password}
                      onChange={(e) => setValues((c) => ({ ...c, password: e.target.value }))}
                      className="app-input mt-2 text-sm"
                      placeholder="Minimum 8 characters"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                  </label>

                  {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-cyan-500 px-6 py-4 text-sm font-semibold text-white shadow-md shadow-accent/25 hover:shadow-accent/40 transition-shadow disabled:opacity-60"
                  >
                    {isSubmitting ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <p className="mt-5 text-xs text-white/30 leading-relaxed">
                  New accounts start with a seeded sample portfolio so the dashboard and insights are usable immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
