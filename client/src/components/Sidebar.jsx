import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, PlusCircle, Lightbulb, Link2, Shield, LogOut, Calculator } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import CalculatorModal from './Calculator.jsx'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/assets', icon: Wallet, label: 'Assets' },
  { to: '/connect', icon: Link2, label: 'Connect' },
  { to: '/add', icon: PlusCircle, label: 'Add Asset' },
  { to: '/insights', icon: Lightbulb, label: 'Insights' },
]

function initialsFor(username) {
  const letters = String(username || 'SS')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

  return letters || 'SS'
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [showCalc, setShowCalc] = useState(false)

  return (
    <aside className="app-sidebar fixed left-0 top-0 z-50 flex h-screen w-64 flex-col">
      <div className="border-b border-white/[0.06] px-6 py-6">
        <NavLink to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-400">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">SafeSeven</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/40">Financial health</p>
          </div>
        </NavLink>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'border border-accent/20 bg-accent/10 text-accent'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setShowCalc(true)}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white/50 hover:bg-white/[0.04] hover:text-white/80 transition-all duration-200"
        >
          <Calculator className="h-[18px] w-[18px]" />
          Calculator
        </button>
      </nav>

      <div className="border-t border-white/[0.06] px-3 py-3 space-y-1">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 ${
              isActive
                ? 'border border-accent/20 bg-accent/10'
                : 'hover:bg-white/[0.04]'
            }`
          }
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-cyan-400 text-xs font-bold text-white flex-shrink-0">
            {initialsFor(user?.username)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/90">{user?.username || 'SafeSeven User'}</p>
            <p className="text-[11px] text-white/40">Private portfolio sync</p>
          </div>
        </NavLink>

        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm text-white/40 hover:bg-white/[0.04] hover:text-white/70 transition-all duration-200"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} />}
    </aside>
  )
}
