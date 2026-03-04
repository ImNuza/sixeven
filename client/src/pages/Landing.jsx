import { Link } from 'react-router-dom'
import { Shield, ArrowRight, BarChart3, Brain, Lock } from 'lucide-react'

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
    title: 'Secure & Private',
    desc: 'Your data stays yours. Bank-grade encryption with full transparency.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">SafeSeven</span>
        </div>
        <Link
          to="/dashboard"
          className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
        >
          Open Dashboard
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-20">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          NTU FinTech Hackathon 2026
        </div>

        <h1 className="text-6xl font-extrabold leading-tight max-w-3xl">
          <span className="text-white">Your Total Wealth.</span>
          <br />
          <span className="gradient-text">One Clear Picture.</span>
        </h1>

        <p className="text-lg text-white/40 max-w-xl mt-6 leading-relaxed">
          SafeSeven unifies your traditional and digital assets into a single wellness dashboard
          — so you can make smarter, healthier financial decisions.
        </p>

        <Link
          to="/dashboard"
          className="mt-10 inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-accent to-blue-600 text-white font-semibold text-base hover:opacity-90 transition-opacity glow-blue"
        >
          Get Started
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-6 px-8 pb-20 max-w-5xl mx-auto w-full">
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
  )
}
