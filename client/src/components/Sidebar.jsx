import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, PlusCircle, Lightbulb, Shield } from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/assets', icon: Wallet, label: 'Assets' },
  { to: '/add', icon: PlusCircle, label: 'Add Asset' },
  { to: '/insights', icon: Lightbulb, label: 'Insights' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-navy-800/60 backdrop-blur-xl border-r border-white/[0.06] flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">SafeSeven</h1>
            <p className="text-[10px] text-white/40 font-medium tracking-widest uppercase">Wealth Wellness</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              }`
            }
          >
            <Icon className="w-[18px] h-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User Card */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-xs font-bold">
            AT
          </div>
          <div>
            <p className="text-sm font-medium text-white/90">Alex Tan</p>
            <p className="text-[11px] text-white/40">Singapore</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
