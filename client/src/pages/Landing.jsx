import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, ArrowRight, BarChart3, Brain, Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

const features = [
  {
    icon: BarChart3,
    title: 'Unified Wealth View',
    desc: 'Aggregate all your assets — stocks, crypto, property, CPF — into a single dashboard.',
  },
  {
    icon: Brain,
    title: 'AI-Powered Insights',
    desc: 'Get personalized, data-driven recommendations to optimize your financial wellness.',
  },
  {
    icon: Lock,
    title: 'Private Accounts',
    desc: 'Each SafeSeven account stores its own portfolio, snapshots, and credentials on your local server.',
  },
]

const initialForm = {
  username: '',
  email: '',
  password: '',
}

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, register, user } = useAuth()
  const [mode, setMode] = useState('login')
  const [values, setValues] = useState(initialForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const redirectTarget = location.state?.from || '/dashboard'

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
    <div className="app-shell flex min-h-screen flex-col">
      <nav className="flex items-center justify-between border-b border-white/[0.04] px-8 py-5">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-400">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">SafeSeven</span>
        </Link>
        {isAuthenticated ? (
          <Link
            to="/dashboard"
            className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
          >
            Continue as {user?.username}
          </Link>
        ) : (
          <span className="text-sm text-white/40">Local portfolio intelligence</span>
        )}
      </nav>

      <div className="mx-auto grid max-w-7xl flex-1 grid-cols-[1.15fr_0.85fr] items-center gap-10 px-8 py-20 w-full">
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            NTU FinTech Hackathon 2026
          </div>

          <h1 className="max-w-3xl text-6xl font-semibold leading-tight">
            <span className="text-white">Your Total Wealth.</span>
            <br />
            <span className="gradient-text">Clearer. Calmer. Healthier.</span>
          </h1>

          <p className="text-lg text-white/40 max-w-xl mt-6 leading-relaxed">
            SafeSeven unifies traditional and digital assets into a single wellness dashboard with
            live market pricing, portfolio snapshots, and account-based storage.
          </p>

          <div className="mt-14 grid max-w-5xl grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass-card-hover p-6">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">Account Access</p>
              <h2 className="mt-2 text-2xl font-bold text-white">
                {mode === 'login' ? 'Sign in to your portfolio' : 'Create a SafeSeven account'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === 'login' ? 'register' : 'login'))
                setError('')
              }}
              className="text-sm text-accent"
            >
              {mode === 'login' ? 'Register' : 'Sign In'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Username</span>
              <input
                value={values.username}
                onChange={(event) => setValues((current) => ({ ...current, username: event.target.value }))}
                className="app-input mt-2 text-sm"
                placeholder="matth"
              />
            </label>

            {mode === 'register' ? (
              <label className="block">
                <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Recovery Email</span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
                  className="app-input mt-2 text-sm"
                  placeholder="Optional, for future multi-device recovery"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Password</span>
              <input
                type="password"
                value={values.password}
                onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
                className="app-input mt-2 text-sm"
                placeholder="Minimum 8 characters"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-blue-600 px-6 py-4 text-white font-semibold transition disabled:opacity-60"
            >
              {isSubmitting ? 'Working...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-4 text-sm text-white/45">
            New accounts start with a seeded sample portfolio so the dashboard, assets inventory,
            and insights page are usable immediately.
          </p>
        </div>
      </div>
    </div>
  )
}
