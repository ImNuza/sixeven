import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Shield, ArrowRight, X, Check } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Design Tokens — Clinical Apex ─────────────────────────────
const T = {
  bg: '#FAFAF8',
  dark: '#0F172A',
  accent: '#C9A84C',
  muted: '#64748B',
  border: 'rgba(15,23,42,0.07)',
  mono: "'IBM Plex Mono', monospace",
  serif: "'Cormorant Garamond', serif",
}

const btn = (base = {}) => ({
  transition: 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
  cursor: 'pointer',
  ...base,
})

// ── SVG Noise Overlay ─────────────────────────────────────────
function NoiseOverlay() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[9999] opacity-[0.038]"
      style={{ width: '100vw', height: '100vh' }}
    >
      <filter id="ss-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ss-noise)" />
    </svg>
  )
}

// ── Navbar ─────────────────────────────────────────────────────
function Navbar({ heroRef, onCTAClick }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = heroRef?.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [heroRef])

  const tc = scrolled ? T.dark : '#FFFFFF'
  const mc = scrolled ? T.muted : 'rgba(255,255,255,0.48)'

  return (
    <nav
      className="fixed top-4 left-1/2 z-50 flex items-center gap-6 px-5 py-2.5 transition-all duration-500"
      style={{
        transform: 'translateX(-50%)',
        borderRadius: '3rem',
        whiteSpace: 'nowrap',
        background: scrolled ? 'rgba(250,250,248,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        border: `1px solid ${scrolled ? T.border : 'rgba(255,255,255,0.14)'}`,
        boxShadow: scrolled ? '0 4px 32px rgba(15,23,42,0.09)' : 'none',
      }}
    >
      <div className="flex items-center gap-2 mr-2">
        <div
          className="flex h-7 w-7 items-center justify-center"
          style={{ borderRadius: '0.55rem', background: T.dark }}
        >
          <Shield className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
        </div>
        <span className="text-sm font-bold tracking-tight" style={{ color: tc }}>SafeSeven</span>
      </div>

      {['Features', 'Security'].map(l => (
        <a
          key={l}
          href={`#${l.toLowerCase()}`}
          className="hidden text-xs font-medium transition-all duration-200 hover:-translate-y-px md:block"
          style={{ color: mc }}
        >{l}</a>
      ))}

      <button
        onClick={onCTAClick}
        className="rounded-full px-4 py-1.5 text-xs font-semibold text-white"
        style={btn({ background: T.accent })}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        Get started
      </button>
    </nav>
  )
}

// ── Auth Modal ─────────────────────────────────────────────────
const initForm = { username: '', email: '', password: '' }

// Inline styles for modal inputs — light background requires explicit dark-mode overrides
const mInput = {
  width: '100%',
  borderRadius: '0.875rem',
  border: '1.5px solid rgba(15,23,42,0.14)',
  background: 'rgba(15,23,42,0.05)',
  color: '#0F172A',
  padding: '0.78rem 1rem',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 180ms ease, box-shadow 180ms ease',
  display: 'block',
}

function ModalInput({ label, icon: Icon, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: T.muted, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <Icon
            size={14}
            style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: focused ? T.accent : 'rgba(15,23,42,0.35)', transition: 'color 180ms' }}
          />
        )}
        <input
          {...props}
          style={{
            ...mInput,
            paddingLeft: Icon ? '2.4rem' : '1rem',
            borderColor: focused ? T.accent : 'rgba(15,23,42,0.14)',
            boxShadow: focused ? `0 0 0 3px rgba(201,168,76,0.14)` : 'none',
          }}
          onFocus={e => { setFocused(true); props.onFocus?.(e) }}
          onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        />
      </div>
    </div>
  )
}

function AuthModal({ onClose, redirectTarget }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [values, setValues] = useState(initForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      if (mode === 'login') {
        await login(values)
        navigate(redirectTarget, { replace: true })
      } else {
        await register(values)
        navigate('/onboarding', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: 'blur(8px)' }} />
      <div
        className="relative z-10 w-full max-w-sm"
        style={{ background: '#FFFFFF', borderRadius: '2rem', padding: '2rem', boxShadow: '0 40px 100px rgba(0,0,0,0.45)', border: '1px solid rgba(15,23,42,0.07)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ color: T.muted, background: 'rgba(15,23,42,0.05)' }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center"
            style={{ borderRadius: '0.75rem', background: T.dark }}
          >
            <Shield className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: T.dark, letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="mt-1 text-sm" style={{ color: T.muted }}>
            {mode === 'login' ? 'Sign in to see your wealth score.' : 'Start your wealth journey — takes 30 seconds.'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex rounded-xl p-1" style={{ background: 'rgba(15,23,42,0.05)' }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all duration-200"
              style={{
                background: mode === m ? '#FFFFFF' : 'transparent',
                color: mode === m ? T.dark : T.muted,
                boxShadow: mode === m ? '0 1px 6px rgba(15,23,42,0.12)' : 'none',
              }}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <ModalInput
            label="Username"
            value={values.username}
            onChange={e => setValues(c => ({ ...c, username: e.target.value }))}
            placeholder="e.g. john_tan"
            autoComplete="username"
            autoFocus
          />

          {mode === 'register' && (
            <ModalInput
              label="Email (optional)"
              type="email"
              value={values.email}
              onChange={e => setValues(c => ({ ...c, email: e.target.value }))}
              placeholder="you@example.com"
              autoComplete="email"
            />
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: T.muted, marginBottom: '0.35rem', letterSpacing: '0.03em' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={values.password}
                onChange={e => setValues(c => ({ ...c, password: e.target.value }))}
                placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ ...mInput, paddingRight: '3rem' }}
                onFocus={e => { e.target.style.borderColor = T.accent; e.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.14)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(15,23,42,0.14)'; e.target.style.boxShadow = 'none' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: '0.7rem',
                  fontFamily: T.mono, fontWeight: 600, letterSpacing: '0.04em',
                }}
              >
                {showPw ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
              <span className="mt-0.5 text-red-500" style={{ fontSize: 12 }}>✕</span>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            style={btn({ background: T.dark })}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {submitting ? 'Working…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px]" style={{ color: 'rgba(15,23,42,0.28)', fontFamily: T.mono }}>
          AES-256-GCM · Argon2id · Zero-knowledge
        </p>
      </div>
    </div>
  )
}

// ── Interactive Globe Hero ─────────────────────────────────────
const GLOBE_HUBS = [
  { lat: 1.3,   lon: 103.8,  label: 'SGX',      value: '+2.4%', up: true  },
  { lat: 40.7,  lon: -74.0,  label: 'NYSE',     value: '+1.8%', up: true  },
  { lat: 51.5,  lon: -0.12,  label: 'LSE',      value: '-0.3%', up: false },
  { lat: 35.7,  lon: 139.7,  label: 'TSE',      value: '+0.9%', up: true  },
  { lat: 22.3,  lon: 114.2,  label: 'HKEX',     value: '+1.2%', up: true  },
  { lat: -33.9, lon: 151.2,  label: 'ASX',      value: '+0.7%', up: true  },
  { lat: 48.9,  lon: 2.35,   label: 'EURO',     value: '+0.5%', up: true  },
]
const GLOBE_ROUTES = [[0,4],[0,3],[1,2],[2,3],[3,4],[0,1]]

// ── Simplified continent polygons [lat, lon] ──────────────────
const CONTINENTS = [
  // North America
  [[72,-165],[70,-140],[72,-105],[72,-78],[70,-60],[60,-64],[48,-54],
   [44,-66],[36,-76],[25,-80],[24,-82],[22,-90],[16,-86],[8,-77],
   [9,-79],[20,-87],[23,-90],[26,-97],[30,-97],[30,-110],[32,-117],
   [38,-123],[49,-124],[56,-130],[59,-139],[60,-145],[65,-168],[72,-165]],
  // South America
  [[12,-72],[10,-62],[8,-60],[5,-52],[2,-52],[0,-50],[-5,-35],
   [-12,-38],[-18,-39],[-23,-43],[-30,-50],[-33,-53],[-35,-57],
   [-38,-62],[-52,-68],[-55,-66],[-55,-70],[-50,-74],[-44,-75],
   [-38,-73],[-30,-71],[-18,-70],[-5,-80],[0,-80],[8,-77],[12,-72]],
  // Europe
  [[71,28],[70,31],[65,27],[60,21],[58,5],[53,5],[51,2],[48,-2],
   [44,-1],[37,-5],[36,-5],[36,3],[38,10],[40,10],[38,15],[42,15],
   [41,20],[41,28],[42,35],[46,36],[47,32],[50,30],[55,21],[58,25],
   [60,21],[65,14],[68,14],[70,18],[71,28]],
  // Africa
  [[37,10],[36,12],[32,32],[23,36],[12,42],[0,42],[-10,40],[-20,35],
   [-30,30],[-35,18],[-30,17],[-25,15],[-15,12],[-5,8],[0,8],
   [5,-1],[5,-5],[10,-15],[15,-17],[20,-17],[25,-15],[30,-10],
   [33,0],[35,8],[37,10]],
  // Asia
  [[70,30],[73,55],[72,80],[70,105],[70,132],[63,143],[52,143],
   [44,135],[40,131],[36,128],[25,122],[20,110],[10,100],[4,100],
   [2,103],[4,98],[8,80],[8,77],[20,73],[23,57],[30,48],[38,38],
   [41,36],[41,28],[42,35],[46,36],[47,51],[50,55],[55,60],
   [57,55],[62,45],[65,42],[70,30]],
  // Australia
  [[-10,132],[-15,127],[-22,113],[-32,115],[-35,117],[-37,140],
   [-38,147],[-38,149],[-30,153],[-24,152],[-16,145],[-11,142],
   [-10,136],[-10,132]],
  // Greenland
  [[83,-30],[83,-18],[80,-18],[76,-18],[72,-22],[68,-27],[64,-40],
   [62,-43],[60,-45],[62,-50],[65,-53],[70,-53],[74,-58],[78,-68],
   [82,-47],[83,-30]],
  // Antarctica (approximate band)
  [[-68,0],[-73,30],[-68,60],[-72,90],[-68,120],[-72,150],
   [-70,180],[-72,210],[-68,240],[-73,270],[-68,300],[-72,330],[-68,360]],
]

function Hero({ heroRef, onCTAClick }) {
  const canvasRef  = useRef(null)
  const sectionRef = useRef(null)
  const contentRef = useRef(null)
  const stateRef   = useRef({
    rotY: -1.8,       // start centred on Asia-Pacific
    isDragging: false,
    lastX: 0,
    autoSpeed: 0.0007,
    dragVelocity: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    dpr: 1,
    cssW: 0,
    cssH: 0,
  })

  // GSAP text intro
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-el', { y: 36, opacity: 0, stagger: 0.10, duration: 1.0, ease: 'power3.out', delay: 0.55 })
    }, contentRef)
    return () => ctx.revert()
  }, [])

  // ── Canvas globe ──────────────────────────────────────────────
  useEffect(() => {
    const canvas  = canvasRef.current
    const section = sectionRef.current
    if (!canvas || !section) return
    const ctx = canvas.getContext('2d')
    let animId

    // Stars: fractional position, depth = parallax factor (0=far, 1=near)
    const stars = Array.from({ length: 220 }, () => ({
      fx: Math.random(), fy: Math.random(),
      r:     Math.random() * 1.4 + 0.2,
      base:  Math.random() * 0.45 + 0.25,
      phase: Math.random() * Math.PI * 2,
      depth: Math.random() * 0.8 + 0.1,
    }))

    // ── DPR-aware resize ──────────────────────────────────────
    function resize() {
      const dpr = window.devicePixelRatio || 1
      const w   = canvas.offsetWidth
      const h   = canvas.offsetHeight
      canvas.width  = w * dpr
      canvas.height = h * dpr
      stateRef.current.dpr  = dpr
      stateRef.current.cssW = w
      stateRef.current.cssH = h
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // ── Math helpers (work in CSS-pixel space after dpr scale) ──
    function ll3(lat, lon, r) {
      const phi   = (90 - lat) * Math.PI / 180
      const theta = lon         * Math.PI / 180
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
      }
    }
    function ry(p, a) {
      return {
        x:  p.x * Math.cos(a) - p.z * Math.sin(a),
        y:  p.y,
        z:  p.x * Math.sin(a) + p.z * Math.cos(a),
      }
    }
    function proj(p, cx, cy) {
      const fov = 700
      const s   = fov / (fov - p.z)
      return { px: cx + p.x * s, py: cy - p.y * s }
    }
    function arcPt(a, b, t, r) {
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const z = a.z + (b.z - a.z) * t
      const l = Math.sqrt(x*x + y*y + z*z)
      return { x: x/l*r, y: y/l*r, z: z/l*r }
    }

    // ── Continent polygon renderer with horizon clipping ───────
    function drawContinents(rotAngle, R, cx, cy) {
      ctx.fillStyle   = 'rgba(52,108,68,0.44)'
      ctx.strokeStyle = 'rgba(70,135,85,0.42)'
      ctx.lineWidth   = 0.7

      CONTINENTS.forEach(coords => {
        // Pre-rotate all vertices
        const pts = coords.map(([lat, lon]) => ry(ll3(lat, lon, R * 1.001), rotAngle))

        ctx.beginPath()
        let started = false

        for (let i = 0; i < pts.length - 1; i++) {
          const cur = pts[i]
          const nxt = pts[i + 1]
          const cv  = cur.z > 0
          const nv  = nxt.z > 0

          if (cv) {
            const { px, py } = proj(cur, cx, cy)
            if (!started) { ctx.moveTo(px, py); started = true }
            else ctx.lineTo(px, py)

            if (!nv) {
              // Interpolate to the horizon crossing (z = 0)
              const t  = cur.z / (cur.z - nxt.z)
              const xi = { x: cur.x + t*(nxt.x - cur.x), y: cur.y + t*(nxt.y - cur.y), z: 0 }
              const { px: ipx, py: ipy } = proj(xi, cx, cy)
              ctx.lineTo(ipx, ipy)
            }
          } else if (nv) {
            // Resume from horizon crossing
            const t  = cur.z / (cur.z - nxt.z)
            const xi = { x: cur.x + t*(nxt.x - cur.x), y: cur.y + t*(nxt.y - cur.y), z: 0 }
            const { px: ipx, py: ipy } = proj(xi, cx, cy)
            ctx.moveTo(ipx, ipy)
            started = true
          }
        }

        ctx.fill()
        ctx.stroke()
      })
    }

    // ── Main draw ──────────────────────────────────────────────
    function draw(t) {
      const { dpr, cssW: W, cssH: H, rotY: rota, mouseX, mouseY } = stateRef.current
      const wide = W > 768
      const cx   = wide ? W * 0.62 : W * 0.5
      const cy   = H * 0.46
      const R    = Math.min(W, H) * (wide ? 0.35 : 0.29)

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)

      // Space background
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0,   '#030710')
      bg.addColorStop(0.5, '#080B1A')
      bg.addColorStop(1,   '#09101f')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Stars with parallax
      const sOx = (mouseX - 0.5) * 55
      const sOy = (mouseY - 0.5) * 28
      stars.forEach(s => {
        const tw = s.base + Math.sin(t * 0.00075 + s.phase) * 0.18
        ctx.beginPath()
        ctx.arc(
          s.fx * W + sOx * s.depth,
          s.fy * H + sOy * s.depth,
          s.r, 0, Math.PI * 2
        )
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, tw))})`
        ctx.fill()
      })

      // Outer atmosphere glow
      const atm = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.28)
      atm.addColorStop(0,   'rgba(70,140,255,0.22)')
      atm.addColorStop(0.5, 'rgba(55,110,255,0.08)')
      atm.addColorStop(1,   'rgba(50,100,255,0)')
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2)
      ctx.fillStyle = atm; ctx.fill()

      // Ocean sphere (gradient)
      const gGrad = ctx.createRadialGradient(cx - R*0.3, cy - R*0.25, R*0.04, cx, cy, R)
      gGrad.addColorStop(0,    '#2d6496')
      gGrad.addColorStop(0.35, '#15446e')
      gGrad.addColorStop(0.75, '#0b2c4e')
      gGrad.addColorStop(1,    '#050e1c')
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = gGrad; ctx.fill()

      // ── Clip everything below to sphere ──────────────────
      ctx.save()
      ctx.beginPath(); ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2); ctx.clip()

      // Continent fills (below grid lines)
      drawContinents(rota, R, cx, cy)

      // Latitude lines
      for (let lat = -60; lat <= 60; lat += 30) {
        const phi = (90 - lat) * Math.PI / 180
        const yy  = R * Math.cos(phi)
        const rr  = R * Math.sin(phi)
        ctx.beginPath()
        let st = false
        for (let lon = 0; lon <= 362; lon += 3) {
          const theta = lon * Math.PI / 180
          const p = ry({ x: rr * Math.cos(theta), y: yy, z: rr * Math.sin(theta) }, rota)
          if (p.z > 0) {
            const { px, py } = proj(p, cx, cy)
            st ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), (st = true))
          } else { st = false }
        }
        ctx.strokeStyle = lat === 0 ? 'rgba(201,168,76,0.28)' : 'rgba(110,175,255,0.12)'
        ctx.lineWidth   = lat === 0 ? 1.1 : 0.5
        ctx.stroke()
      }

      // Longitude lines
      for (let lon = 0; lon < 360; lon += 30) {
        ctx.beginPath()
        let st = false
        for (let lat = -88; lat <= 88; lat += 3) {
          const p = ry(ll3(lat, lon, R), rota)
          if (p.z > 0) {
            const { px, py } = proj(p, cx, cy)
            st ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), (st = true))
          } else { st = false }
        }
        ctx.strokeStyle = 'rgba(110,175,255,0.11)'
        ctx.lineWidth   = 0.5
        ctx.stroke()
      }

      // Animated dashed trade-route arcs
      const dashOff = (t * 0.00012) % 1
      GLOBE_ROUTES.forEach(([i, j]) => {
        const a = ll3(GLOBE_HUBS[i].lat, GLOBE_HUBS[i].lon, R)
        const b = ll3(GLOBE_HUBS[j].lat, GLOBE_HUBS[j].lon, R)
        ctx.beginPath()
        let st = false
        for (let tt = 0; tt <= 1.01; tt += 0.018) {
          if (((tt + dashOff) % 1) > 0.45) { st = false; continue }
          const p = ry(arcPt(a, b, tt, R), rota)
          if (p.z > 0) {
            const { px, py } = proj(p, cx, cy)
            st ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), (st = true))
          } else { st = false }
        }
        ctx.strokeStyle = 'rgba(201,168,76,0.30)'
        ctx.lineWidth   = 0.9
        ctx.stroke()
      })

      ctx.restore() // end sphere clip

      // Hub markers (allowed to slightly overflow sphere edge)
      GLOBE_HUBS.forEach((hub, idx) => {
        const p = ry(ll3(hub.lat, hub.lon, R), rota)
        if (p.z <= R * 0.05) return
        const alpha   = Math.min(1, (p.z - R * 0.05) / (R * 0.55))
        const { px, py } = proj(p, cx, cy)
        const pulse   = 4.5 + Math.sin(t * 0.0028 + idx * 1.4) * 2

        ctx.beginPath(); ctx.arc(px, py, pulse, 0, Math.PI * 2)
        ctx.strokeStyle = hub.up
          ? `rgba(74,222,128,${alpha * 0.55})` : `rgba(248,113,113,${alpha * 0.55})`
        ctx.lineWidth = 1.2; ctx.stroke()

        ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2)
        ctx.fillStyle = hub.up ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`
        ctx.fill()

        if (alpha > 0.3) {
          ctx.font      = `700 9.5px "IBM Plex Mono", monospace`
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.92})`
          ctx.fillText(hub.label, px + 8, py - 3)
          ctx.font      = `500 8.5px "IBM Plex Mono", monospace`
          ctx.fillStyle = hub.up
            ? `rgba(74,222,128,${alpha * 0.92})` : `rgba(248,113,113,${alpha * 0.92})`
          ctx.fillText(hub.value, px + 8, py + 8)
        }
      })

      // Rim light
      const rim = ctx.createRadialGradient(cx, cy, R * 0.74, cx, cy, R * 1.02)
      rim.addColorStop(0,    'rgba(110,165,255,0)')
      rim.addColorStop(0.88, 'rgba(110,165,255,0)')
      rim.addColorStop(1,    'rgba(140,190,255,0.17)')
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2)
      ctx.fillStyle = rim; ctx.fill()

      // Specular highlight
      const spec = ctx.createRadialGradient(cx - R*0.33, cy - R*0.33, 0, cx - R*0.33, cy - R*0.33, R * 0.65)
      spec.addColorStop(0, 'rgba(255,255,255,0.09)')
      spec.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = spec; ctx.fill()

      // Wealth metrics panel (desktop only)
      if (wide) {
        const mx = cx + R * 0.78
        const my = cy - R * 0.62
        const metrics = [
          { label: 'Portfolio', value: 'S$607K', color: 'rgba(201,168,76,0.9)' },
          { label: 'Score',     value: '73/100', color: 'rgba(74,222,128,0.9)' },
          { label: 'CPF',       value: 'S$148K', color: 'rgba(110,175,255,0.9)' },
        ]
        metrics.forEach((m, i) => {
          const my2    = my + i * 38
          const alpha2 = 0.7 + Math.sin(t * 0.001 + i * 2.1) * 0.15
          ctx.font      = '600 9px "IBM Plex Mono", monospace'
          ctx.fillStyle = `rgba(255,255,255,${alpha2 * 0.45})`
          ctx.fillText(m.label, mx, my2)
          ctx.font      = '700 14px "IBM Plex Mono", monospace'
          ctx.fillStyle = m.color.replace('0.9)', `${alpha2})`)
          ctx.fillText(m.value, mx, my2 + 16)
        })
      }

      ctx.restore() // end dpr scale
    }

    // ── Animation loop ────────────────────────────────────────
    function animate(t) {
      const state = stateRef.current
      if (!state.isDragging) {
        state.rotY -= state.autoSpeed
        if (Math.abs(state.dragVelocity) > 0.00008) {
          state.rotY       += state.dragVelocity
          state.dragVelocity *= 0.93
        } else {
          state.dragVelocity = 0
        }
      }
      draw(t)
      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)

    // ── Pointer / touch events registered on the SECTION ──────
    // Using section-level mousedown avoids the content-div z-index
    // blocking events when hovering over the text area.
    function onDown(e) {
      // Ignore if the actual click target is a button or link
      if (e.target.closest('button, a')) return
      const x = e.touches ? e.touches[0].clientX : e.clientX
      stateRef.current.isDragging   = true
      stateRef.current.lastX        = x
      stateRef.current.dragVelocity = 0
      section.style.cursor = 'grabbing'
    }
    function onMove(e) {
      const x    = e.touches ? e.touches[0].clientX : e.clientX
      const y    = e.touches ? e.touches[0].clientY : e.clientY
      const rect = canvas.getBoundingClientRect()
      stateRef.current.mouseX = (x - rect.left) / rect.width
      stateRef.current.mouseY = (y - rect.top)  / rect.height
      if (stateRef.current.isDragging) {
        const dx  = x - stateRef.current.lastX
        const vel = -dx * 0.007
        stateRef.current.rotY         += vel
        stateRef.current.dragVelocity  = vel
        stateRef.current.lastX         = x
      }
    }
    function onUp() {
      stateRef.current.isDragging = false
      section.style.cursor = 'grab'
    }

    section.addEventListener('mousedown',  onDown)
    section.addEventListener('touchstart', onDown, { passive: true })
    section.addEventListener('touchmove',  onMove, { passive: true })
    section.addEventListener('touchend',   onUp)
    window.addEventListener('mousemove',   onMove)
    window.addEventListener('mouseup',     onUp)

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      section.removeEventListener('mousedown',  onDown)
      section.removeEventListener('touchstart', onDown)
      section.removeEventListener('touchmove',  onMove)
      section.removeEventListener('touchend',   onUp)
      window.removeEventListener('mousemove',   onMove)
      window.removeEventListener('mouseup',     onUp)
    }
  }, [])

  return (
    <section ref={el => { heroRef.current = el; sectionRef.current = el }}
      className="relative flex min-h-[100dvh] flex-col"
      style={{ cursor: 'grab' }}
    >
      {/* DPR-aware globe canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      />

      {/* Readability gradients */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(3,7,16,0.82) 0%, rgba(3,7,16,0.50) 38%, rgba(3,7,16,0.08) 65%, transparent 100%)' }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(3,7,16,0.90), transparent)' }}
      />

      {/* Content — pointer-events-none on wrapper; re-enable only on interactive children */}
      <div ref={contentRef}
        className="relative z-10 flex flex-col justify-end min-h-[100dvh] px-8 pb-16 md:px-20 md:max-w-[52%]"
        style={{ pointerEvents: 'none' }}
      >
        <p className="hero-el mb-5 text-[11px] uppercase tracking-[0.28em]"
          style={{ fontFamily: T.mono, color: T.accent }}>
          Wealth Intelligence Platform
        </p>

        <h1 className="hero-el mb-6 leading-[0.93]">
          <span className="block text-5xl font-black text-white md:text-7xl"
            style={{ letterSpacing: '-0.035em' }}>
            All your wealth,
          </span>
          <span className="block" style={{
            fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(3.5rem, 8vw, 7rem)', color: T.accent, letterSpacing: '-0.01em',
          }}>
            Understood.
          </span>
        </h1>

        <p className="hero-el mb-2 max-w-md text-base leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.48)' }}>
          One intelligent dashboard. Every asset, account, and insight — scored, simplified, and always secure.
        </p>

        <p className="hero-el mb-7 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.22)', fontFamily: T.mono }}>
          ← drag the globe to explore global markets →
        </p>

        <div className="hero-el flex flex-col items-start gap-5">
          <button
            onClick={onCTAClick}
            className="group inline-flex items-center gap-3 rounded-full px-7 py-3.5 text-sm font-semibold text-white overflow-hidden"
            style={{ ...btn({ background: T.accent }), pointerEvents: 'auto' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            See your wealth score
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>

          <div className="flex flex-wrap items-center gap-6">
            {['AES-256-GCM encrypted', 'SGD-native', 'CPF · SGX · Crypto'].map(t => (
              <span key={t} className="flex items-center gap-1.5 text-[11px]"
                style={{ color: 'rgba(255,255,255,0.26)', fontFamily: T.mono }}>
                <span style={{ color: T.accent, fontSize: 7 }}>◆</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Feature Card 1: Diagnostic Shuffler (TRACK) ───────────────
const ASSETS = [
  { label: 'SGX Stocks',   value: '$84,200',  change: '+2.4%', up: true },
  { label: 'Crypto',       value: '$23,400',  change: '+8.1%', up: true },
  { label: 'CPF Balance',  value: '$148,000', change: '+3.2%', up: true },
  { label: 'Property',     value: '$320,000', change: '+0.8%', up: true },
  { label: 'SGX Bonds',    value: '$31,500',  change: '-0.3%', up: false },
]

function DiagnosticShuffler() {
  const [items, setItems] = useState(ASSETS)

  useEffect(() => {
    const id = setInterval(() => {
      setItems(prev => {
        const next = [...prev]
        next.push(next.shift())
        return next
      })
    }, 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '2rem',
        border: `1px solid ${T.border}`,
        padding: '1.75rem',
        boxShadow: '0 2px 24px rgba(15,23,42,0.06)',
        overflow: 'hidden',
      }}
    >
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ fontFamily: T.mono, color: T.accent }}>Track</p>
      <h3 className="mb-1 text-lg font-bold" style={{ color: T.dark, letterSpacing: '-0.02em' }}>All assets, one view</h3>
      <p className="mb-5 text-sm" style={{ color: T.muted }}>Every asset class, live-priced and unified.</p>

      {/* Stacking cards */}
      <div className="relative" style={{ height: 148 }}>
        {items.slice(0, 3).map((item, i) => (
          <div
            key={item.label}
            className="absolute inset-x-0 transition-all duration-500"
            style={{
              top: `${i * 10}px`,
              transform: `scale(${1 - i * 0.04})`,
              transformOrigin: 'top center',
              zIndex: 3 - i,
              opacity: 1 - i * 0.28,
              borderRadius: '1.25rem',
              background: i === 0 ? T.dark : i === 1 ? '#1E293B' : '#2D3F55',
              padding: '1rem 1.25rem',
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>{item.label}</span>
              <span className="text-xs" style={{ fontFamily: T.mono, color: item.up ? '#4ade80' : '#f87171' }}>
                {item.change}
              </span>
            </div>
            <p
              className="mt-1 text-2xl font-bold text-white"
              style={{ fontFamily: T.mono, letterSpacing: '-0.025em' }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Feature Card 2: Telemetry Typewriter (ANALYZE) ────────────
const AI_MSGS = [
  'Scanning 847 data points...',
  'Portfolio concentration: MODERATE',
  'CPF SA optimisation: +$12,400',
  'Wealth score updated: 73 / 100 ↑',
  'Tech sector overweight by 14%',
  'Emergency fund: 82% of target',
  'Rebalancing signal detected...',
]

function TelemetryTypewriter() {
  const [text, setText] = useState('')
  const [msgIdx, setMsgIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (clearing) {
      const t = setTimeout(() => {
        setClearing(false)
        setMsgIdx(i => (i + 1) % AI_MSGS.length)
        setCharIdx(0)
        setText('')
      }, 550)
      return () => clearTimeout(t)
    }
    const msg = AI_MSGS[msgIdx]
    if (charIdx < msg.length) {
      const t = setTimeout(() => {
        setText(msg.slice(0, charIdx + 1))
        setCharIdx(c => c + 1)
      }, 42)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setClearing(true), 1700)
    return () => clearTimeout(t)
  }, [charIdx, msgIdx, clearing])

  const prev = AI_MSGS.slice(Math.max(0, msgIdx - 2), msgIdx)

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: '2rem',
        border: `1px solid ${T.border}`,
        padding: '1.75rem',
        boxShadow: '0 2px 24px rgba(15,23,42,0.06)',
      }}
    >
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ fontFamily: T.mono, color: T.accent }}>Analyze</p>
      <h3 className="mb-1 text-lg font-bold" style={{ color: T.dark, letterSpacing: '-0.02em' }}>Live AI insights</h3>
      <p className="mb-5 text-sm" style={{ color: T.muted }}>WealthAI scans your portfolio in real time.</p>

      <div className="rounded-[1.25rem] p-4" style={{ background: T.dark }}>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
          <span className="text-[10px] uppercase tracking-widest text-green-400" style={{ fontFamily: T.mono }}>
            Live Analysis
          </span>
        </div>
        {prev.map(m => (
          <p key={m} className="mb-1 text-xs" style={{ fontFamily: T.mono, color: 'rgba(255,255,255,0.18)' }}>
            › {m}
          </p>
        ))}
        <p className="text-xs text-green-400" style={{ fontFamily: T.mono }}>
          ›{' '}
          <span style={{ opacity: clearing ? 0.3 : 1, transition: 'opacity 0.3s' }}>{text}</span>
          <span className="ml-0.5 animate-pulse" style={{ color: T.accent }}>▮</span>
        </p>
      </div>
    </div>
  )
}

// ── Feature Card 3: Cursor Protocol Scheduler (GROW) ──────────
const SCHED_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const SCHED_STEPS = [
  { col: 3, label: 'Review Portfolio', row: 1 },
  { col: 5, label: 'Rebalance',        row: 1 },
  { col: 6, label: 'Monthly Report',   row: 2 },
]

function CursorScheduler() {
  const [phase, setPhase] = useState(0) // 0 hidden, 1 move-to-cell, 2 click, 3 move-save, 4 save, 5 reset
  const [stepIdx, setStepIdx] = useState(0)
  const containerRef = useRef(null)
  const cellRefs = useRef({})   // key: `${row}-${col}` → DOM element
  const saveBtnRef = useRef(null)
  const [cellPos, setCellPos] = useState({ x: 20, y: 20 })
  const [savePos, setSavePos] = useState({ x: 110, y: 178 })

  useEffect(() => {
    const durations = [600, 900, 500, 700, 900, 1200]
    const t = setTimeout(() => setPhase(p => (p + 1) % 6), durations[phase])
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase === 0) {
      setStepIdx(s => (s + 1) % SCHED_STEPS.length)
    }
  }, [phase])

  // Measure actual cell position whenever the target step changes
  useEffect(() => {
    const step = SCHED_STEPS[stepIdx]
    const cellEl = cellRefs.current[`${step.row}-${step.col}`]
    const containerEl = containerRef.current
    if (!cellEl || !containerEl) return
    const cRect = containerEl.getBoundingClientRect()
    const eRect = cellEl.getBoundingClientRect()
    // Place cursor tip at top-left of cell (offset by 2px so tip lands on cell edge)
    setCellPos({
      x: eRect.left - cRect.left + 2,
      y: eRect.top  - cRect.top  + 2,
    })
  }, [stepIdx])

  // Measure save button position after first render
  useEffect(() => {
    const btnEl = saveBtnRef.current
    const containerEl = containerRef.current
    if (!btnEl || !containerEl) return
    const cRect = containerEl.getBoundingClientRect()
    const bRect = btnEl.getBoundingClientRect()
    setSavePos({
      x: bRect.left - cRect.left + bRect.width / 2 - 4,
      y: bRect.top  - cRect.top  + 6,
    })
  }, [])

  const activeStep = SCHED_STEPS[stepIdx]
  const saveActive = phase === 4

  const cursorX = phase >= 3 ? savePos.x : cellPos.x
  const cursorY = phase >= 3 ? savePos.y : cellPos.y

  return (
    <div
      ref={containerRef}
      style={{
        background: '#FFFFFF',
        borderRadius: '2rem',
        border: `1px solid ${T.border}`,
        padding: '1.75rem',
        boxShadow: '0 2px 24px rgba(15,23,42,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ fontFamily: T.mono, color: T.accent }}>Grow</p>
      <h3 className="mb-1 text-lg font-bold" style={{ color: T.dark, letterSpacing: '-0.02em' }}>Scheduled wealth reviews</h3>
      <p className="mb-4 text-sm" style={{ color: T.muted }}>Set it once. Stay on track forever.</p>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {SCHED_DAYS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px]"
            style={{ fontFamily: T.mono, color: T.muted }}
          >{d}</div>
        ))}
      </div>

      {/* 3 week rows */}
      {[1, 8, 15].map((startDay, row) => (
        <div key={row} className="grid grid-cols-7 gap-1 mb-1">
          {SCHED_DAYS.map((_, col) => {
            const isTarget = activeStep.col === col && activeStep.row === row
            const isActive = isTarget && (phase === 2 || phase === 3 || phase === 4)
            return (
              <div
                key={col}
                ref={el => { if (el) cellRefs.current[`${row}-${col}`] = el }}
                className="flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition-all duration-300"
                style={{
                  fontFamily: T.mono,
                  background: isActive ? T.accent : isTarget && phase === 1 ? `${T.accent}22` : 'transparent',
                  color: isActive ? '#FFF' : isTarget ? T.accent : T.muted,
                  transform: isTarget && phase === 2 ? 'scale(0.88)' : 'scale(1)',
                }}
              >
                {startDay + col <= 21 ? startDay + col : ''}
              </div>
            )
          })}
        </div>
      ))}

      {/* Save button */}
      <button
        ref={saveBtnRef}
        className="mt-3 w-full rounded-xl py-2 text-xs font-semibold transition-all duration-400"
        style={{
          fontFamily: T.mono,
          background: saveActive ? T.accent : `${T.accent}18`,
          color: saveActive ? '#FFF' : T.accent,
          transform: saveActive ? 'scale(0.97)' : 'scale(1)',
        }}
      >
        {saveActive ? '✓  Saved' : 'Save schedule'}
      </button>

      {/* Animated SVG cursor — positioned by DOM measurement */}
      <svg
        className="pointer-events-none absolute"
        width="18"
        height="22"
        viewBox="0 0 18 22"
        style={{
          top: 0,
          left: 0,
          opacity: phase >= 1 && phase <= 4 ? 1 : 0,
          transform: `translate(${cursorX}px, ${cursorY}px)`,
          transition: 'transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s ease',
        }}
      >
        <path
          d="M1 1 L1 17 L5 13 L8 20 L10.5 19 L7.5 12 L13 12 Z"
          fill={T.dark}
          stroke="white"
          strokeWidth="1"
        />
      </svg>
    </div>
  )
}

// ── Features Section ───────────────────────────────────────────
function Features() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.feat-card', {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 78%',
        },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} id="features" className="px-6 py-24 md:px-20" style={{ background: T.bg }}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-14 text-center">
          <p
            className="mb-3 text-[11px] uppercase tracking-[0.22em]"
            style={{ fontFamily: T.mono, color: T.accent }}
          >
            The Platform
          </p>
          <h2
            className="text-4xl font-black md:text-5xl"
            style={{ color: T.dark, letterSpacing: '-0.03em' }}
          >
            Track. Analyze. Grow.
          </h2>
          <p className="mt-4 text-base" style={{ color: T.muted }}>
            Three interactive lenses into your complete financial picture.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="feat-card"><DiagnosticShuffler /></div>
          <div className="feat-card"><TelemetryTypewriter /></div>
          <div className="feat-card"><CursorScheduler /></div>
        </div>
      </div>
    </section>
  )
}

// ── Philosophy ─────────────────────────────────────────────────
function Philosophy() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.philo-word', {
        opacity: 0,
        y: 18,
        stagger: 0.035,
        duration: 0.55,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.philo-body',
          start: 'top 72%',
        },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const words2 = ['We', 'focus', 'on:', 'one score', 'that', 'tells', 'you', 'everything.']

  return (
    <section
      ref={ref}
      className="relative overflow-hidden px-8 py-28 md:px-20"
      style={{ background: T.dark }}
    >
      {/* Organic texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=55)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.07,
        }}
      />

      <div className="philo-body relative z-10 max-w-4xl mx-auto">
        {/* Eyebrow */}
        <p
          className="philo-word mb-6 inline-block text-[11px] uppercase tracking-[0.25em]"
          style={{ fontFamily: T.mono, color: T.accent }}
        >
          Our Philosophy
        </p>

        {/* Contrast line 1 — smaller, neutral */}
        <p className="mb-6 text-lg leading-relaxed md:text-xl" style={{ color: 'rgba(255,255,255,0.36)' }}>
          {['Most', 'wealth', 'apps', 'focus', 'on:', 'more', 'features,', 'more', 'noise.'].map((w, i) => (
            <span key={i} className="philo-word inline-block mr-2">{w}</span>
          ))}
        </p>

        {/* Contrast line 2 — massive, serif italic */}
        <p
          className="text-3xl leading-tight md:text-5xl"
          style={{ fontFamily: T.serif, fontWeight: 300, color: '#FFFFFF', lineHeight: 1.2 }}
        >
          {words2.map((w, i) => (
            <span
              key={i}
              className="philo-word inline-block mr-3"
              style={w === 'one score' ? { color: T.accent, fontStyle: 'italic' } : {}}
            >
              {w}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}

// ── Protocol SVG Animations ────────────────────────────────────
function ConcentricRings() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" className="opacity-40">
      {[20, 38, 56, 74, 92].map((r, i) => (
        <circle
          key={r}
          cx="100" cy="100" r={r}
          fill="none"
          stroke={T.accent}
          strokeWidth="0.8"
          strokeDasharray={`${r * 0.5} ${r * 0.9}`}
          style={{
            transformOrigin: '100px 100px',
            animation: `${i % 2 === 0 ? 'spin-cw' : 'spin-ccw'} ${9 + i * 3}s linear infinite`,
          }}
        />
      ))}
      <circle cx="100" cy="100" r="8" fill={T.accent} style={{ animation: 'proto-pulse 3s ease-in-out infinite' }} />
    </svg>
  )
}

function EKGWave() {
  const pathRef = useRef(null)

  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    const len = el.getTotalLength()
    el.style.strokeDasharray = `${len}`
    el.style.strokeDashoffset = `${len}`
    const anim = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: 2200, iterations: Infinity, easing: 'linear',
    })
    return () => anim.cancel()
  }, [])

  return (
    <svg width="280" height="72" viewBox="0 0 280 72" className="opacity-50">
      <path
        ref={pathRef}
        d="M0,36 L35,36 L50,36 L60,8 L70,64 L82,36 L100,36 L116,36 L124,22 L132,50 L140,36 L165,36 L178,36 L188,12 L198,60 L208,36 L245,36 L280,36"
        fill="none"
        stroke={T.accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LaserGrid() {
  return (
    <div className="relative opacity-40" style={{ width: 240, height: 144 }}>
      <svg width="240" height="144" viewBox="0 0 240 144">
        {Array.from({ length: 6 }).flatMap((_, row) =>
          Array.from({ length: 12 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={col * 20 + 10} cy={row * 22 + 11}
              r="1.5"
              fill={T.accent}
              opacity="0.4"
            />
          ))
        )}
        {/* Scanning laser */}
        <line x1="0" y1="0" x2="0" y2="144" stroke={T.accent} strokeWidth="1.5" opacity="0.9"
          style={{ animation: 'scan-x 2.6s ease-in-out infinite' }} />
        <line x1="0" y1="0" x2="0" y2="144" stroke={T.accent} strokeWidth="12" opacity="0.07"
          style={{ animation: 'scan-x 2.6s ease-in-out infinite' }} />
      </svg>
    </div>
  )
}

// ── Protocol Section ───────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    title: 'Connect everything.',
    desc: 'Link your Singpass, bank accounts, SGX brokerage, CPF, and crypto wallets — all in minutes, all in one place.',
    canvas: <ConcentricRings />,
    bg: T.dark,
  },
  {
    num: '02',
    title: 'Your score, live.',
    desc: 'SafeSeven calculates your wealth wellness score across diversification, liquidity, growth, and risk. Updated with every new data point.',
    canvas: <EKGWave />,
    bg: '#0A1628',
  },
  {
    num: '03',
    title: 'Act with clarity.',
    desc: 'No generic advice — WealthAI reads your actual portfolio and gives specific, actionable recommendations tailored to your score.',
    canvas: <LaserGrid />,
    bg: '#081220',
  },
]

function Protocol() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray('.proto-card')
      cards.forEach((card, i) => {
        if (i < cards.length - 1) {
          ScrollTrigger.create({
            trigger: cards[i + 1],
            start: 'top 58%',
            onEnter: () => gsap.to(card, {
              scale: 0.91,
              filter: 'blur(5px)',
              opacity: 0.45,
              duration: 0.65,
              ease: 'power2.inOut',
            }),
            onLeaveBack: () => gsap.to(card, {
              scale: 1,
              filter: 'blur(0px)',
              opacity: 1,
              duration: 0.45,
              ease: 'power2.out',
            }),
          })
        }
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} id="security">
      {STEPS.map((step, i) => (
        <div
          key={step.num}
          className="proto-card sticky top-0 flex min-h-screen items-center justify-center px-8 md:px-20"
          style={{ zIndex: i + 1, background: step.bg }}
        >
          <div className="max-w-5xl mx-auto w-full grid grid-cols-1 gap-12 md:grid-cols-2 md:items-center">
            {/* Text */}
            <div>
              <p
                className="mb-4 text-[11px] uppercase tracking-[0.25em]"
                style={{ fontFamily: T.mono, color: T.accent }}
              >
                Step {step.num}
              </p>
              <h2
                className="mb-5 text-4xl font-black text-white md:text-5xl"
                style={{ letterSpacing: '-0.03em', lineHeight: 1.05 }}
              >
                {step.title}
              </h2>
              <p className="text-lg leading-relaxed" style={{ color: 'rgba(255,255,255,0.46)' }}>
                {step.desc}
              </p>
            </div>

            {/* Canvas animation */}
            <div className="flex items-center justify-center">
              {step.canvas}
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

// ── CTA Section ────────────────────────────────────────────────
function CTASection({ onCTAClick }) {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.cta-el', {
        y: 30,
        opacity: 0,
        stagger: 0.12,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 78%' },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} className="px-8 py-28 text-center md:px-20" style={{ background: T.bg }}>
      <div className="max-w-2xl mx-auto">
        <p
          className="cta-el mb-4 text-[11px] uppercase tracking-[0.25em]"
          style={{ fontFamily: T.mono, color: T.accent }}
        >
          Ready?
        </p>
        <h2
          className="cta-el mb-5 text-4xl font-black leading-tight md:text-6xl"
          style={{ color: T.dark, letterSpacing: '-0.035em' }}
        >
          See your wealth score<br />
          <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.accent }}>
            in under two minutes.
          </span>
        </h2>
        <p className="cta-el mb-8 text-base" style={{ color: T.muted }}>
          Join Singaporeans managing their complete financial picture — stocks, crypto, CPF, and property, all scored in one place.
        </p>
        <button
          className="cta-el inline-flex items-center gap-3 rounded-full px-8 py-4 text-sm font-semibold text-white"
          style={btn({ background: T.dark })}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onClick={onCTAClick}
        >
          See your wealth score
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="mt-8 flex items-center justify-center gap-8 flex-wrap">
          {[
            'Free to start',
            'Sample portfolio included',
            'No card required',
          ].map(t => (
            <span key={t} className="flex items-center gap-2 text-sm" style={{ color: T.muted }}>
              <Check className="h-3.5 w-3.5" style={{ color: T.accent }} />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      className="px-8 py-14 md:px-20"
      style={{ background: T.dark, borderRadius: '4rem 4rem 0 0' }}
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 gap-10 md:grid-cols-3">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="flex h-8 w-8 items-center justify-center"
              style={{ borderRadius: '0.65rem', background: T.accent }}
            >
              <Shield className="h-4 w-4 text-white" strokeWidth={1.5} />
            </div>
            <span className="text-sm font-bold text-white">SafeSeven</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Your complete wealth wellness hub — every asset, scored and simplified for Singapore.
          </p>

          {/* System status */}
          <div className="mt-6 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span className="text-xs" style={{ fontFamily: T.mono, color: 'rgba(255,255,255,0.35)' }}>
              All systems operational
            </span>
          </div>
        </div>

        {/* Product */}
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)', fontFamily: T.mono }}>
            Product
          </p>
          {['Dashboard', 'Assets', 'Insights', 'WealthAI', 'Security'].map(l => (
            <p key={l} className="mb-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{l}</p>
          ))}
        </div>

        {/* Legal */}
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.28)', fontFamily: T.mono }}>
            Info
          </p>
          {['Privacy Policy', 'Terms of Service', 'Security', 'About'].map(l => (
            <p key={l} className="mb-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{l}</p>
          ))}
          <p className="mt-6 text-[11px]" style={{ color: 'rgba(255,255,255,0.20)', fontFamily: T.mono }}>
            NTU FinTech Hackathon 2026<br />Schroders Wealth Wellness Hub
          </p>
        </div>
      </div>

      <div
        className="mt-10 flex items-center justify-between border-t pt-6"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.22)', fontFamily: T.mono }}>
          © 2026 SafeSeven. Built for Schroders.
        </p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.15)', fontFamily: T.mono }}>
          AES-256-GCM · Argon2id · HMAC-SHA512
        </p>
      </div>
    </footer>
  )
}

// ── Landing ────────────────────────────────────────────────────
export default function Landing() {
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const heroRef = useRef(null)
  const [showForm, setShowForm] = useState(false)

  const redirectTarget = location.state?.from || '/dashboard'

  // If already authenticated, show a "continue" pill
  useEffect(() => {
    // intentionally not auto-redirecting — user may want to see the landing
  }, [isAuthenticated])

  function openForm() { setShowForm(true) }
  function closeForm() { setShowForm(false) }

  return (
    <div style={{ background: T.bg, fontFamily: "'Inter', sans-serif" }}>
      <NoiseOverlay />

      {isAuthenticated && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-2xl"
            style={{ background: T.dark, backdropFilter: 'blur(12px)' }}
          >
            Continue as {user?.username} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <Navbar heroRef={heroRef} onCTAClick={openForm} />
      <Hero heroRef={heroRef} onCTAClick={openForm} />
      <Features />
      <Philosophy />
      <Protocol />
      <CTASection onCTAClick={openForm} />
      <Footer />

      {showForm && <AuthModal onClose={closeForm} redirectTarget={redirectTarget} />}
    </div>
  )
}
