import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ThemeToggle from './ThemeToggle'

export default function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="ml-64 min-h-screen px-8 py-6">
        <div className="app-topbar sticky top-6 z-40 mb-6 flex items-center justify-between px-5 py-4">
          <div>
            <p className="app-kicker">Portfolio Workspace</p>
            <p className="app-subtitle mt-1 text-sm">A calmer, clearer command center for your balance sheet.</p>
          </div>
          <ThemeToggle />
        </div>
        <Outlet />
      </main>
    </div>
  )
}
