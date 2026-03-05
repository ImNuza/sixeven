import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, PlusCircle, Lightbulb, Shield, LogOut, Calculator, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useChat } from '../context/ChatContext.jsx'
import { useSidebar } from '../context/SidebarContext.jsx'
import CalculatorModal from './Calculator.jsx'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/assets',    icon: Wallet,          label: 'Assets' },
  { to: '/add',       icon: PlusCircle,      label: 'Add Asset' },
  { to: '/insights',  icon: Lightbulb,       label: 'Insights' },
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

function Tip({ label, collapsed, children }) {
  if (!collapsed) return children
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[200] opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg"
          style={{ background: 'var(--app-surface-strong)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
        >
          {label}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { toggleChat, isOpen } = useChat()
  const { collapsed, toggle } = useSidebar()
  const [showCalc, setShowCalc] = useState(false)

  const w = collapsed ? 'w-[68px]' : 'w-64'

  return (
    <aside
      className={`app-sidebar fixed left-0 top-0 z-50 flex h-screen flex-col transition-all duration-300 ease-in-out ${w}`}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 border-b border-white/[0.06]"
        style={{ padding: collapsed ? '20px 0' : '20px 24px' }}
      >
        <NavLink
          to="/dashboard"
          className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}
        >
          <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-400 shadow-md shadow-accent/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--app-text)' }}>SafeSeven</h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'var(--app-text-muted)' }}>Financial health</p>
            </div>
          )}
        </NavLink>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={`absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center shadow-md transition-colors z-10
            hover:bg-accent/10`}
          style={{ background: 'var(--app-surface-strong)', border: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronLeft  className="h-3.5 w-3.5" />
          }
        </button>
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className={`flex-1 space-y-1 py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <Tip key={to} label={label} collapsed={collapsed}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex items-center rounded-2xl py-3 text-sm font-medium transition-all duration-200 ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-4'
                } ${
                  isActive
                    ? 'border border-accent/20 bg-accent/10 text-accent'
                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          </Tip>
        ))}

        <Tip label="Calculator" collapsed={collapsed}>
          <button
            type="button"
            onClick={() => setShowCalc(true)}
            className={`flex w-full items-center rounded-2xl py-3 text-sm font-medium text-white/50 hover:bg-white/[0.04] hover:text-white/80 transition-all duration-200 ${
              collapsed ? 'justify-center px-0' : 'gap-3 px-4'
            }`}
          >
            <Calculator className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && 'Calculator'}
          </button>
        </Tip>

        <Tip label="WealthAI" collapsed={collapsed}>
          <button
            type="button"
            onClick={toggleChat}
            className={`flex w-full items-center rounded-2xl py-3 text-sm font-medium transition-all duration-200 ${
              collapsed ? 'justify-center px-0' : 'gap-3 px-4'
            } ${
              isOpen
                ? 'border border-accent/20 bg-accent/10 text-accent'
                : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
            }`}
          >
            <Sparkles className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && 'WealthAI'}
          </button>
        </Tip>
      </nav>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className={`border-t border-white/[0.06] py-3 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        <Tip label={user?.username || 'Account'} collapsed={collapsed}>
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `flex items-center rounded-2xl py-2.5 transition-all duration-200 ${
                collapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } ${isActive ? 'border border-accent/20 bg-accent/10' : 'hover:bg-white/[0.04]'}`
            }
          >
            <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-cyan-400 text-xs font-bold text-white">
              {initialsFor(user?.username)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--app-text)' }}>{user?.username || 'SafeSeven User'}</p>
                <p className="text-[11px]" style={{ color: 'var(--app-text-muted)' }}>Private portfolio sync</p>
              </div>
            )}
          </NavLink>
        </Tip>

        <Tip label="Sign Out" collapsed={collapsed}>
          <button
            type="button"
            onClick={logout}
            className={`flex w-full items-center rounded-2xl py-2.5 text-sm transition-all duration-200 hover:bg-white/[0.04] ${
              collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
            }`}
            style={{ color: 'var(--app-text-muted)' }}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
        </Tip>
      </div>

      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} />}
    </aside>
  )
}
