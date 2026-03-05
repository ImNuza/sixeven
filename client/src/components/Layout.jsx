import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="ml-64 min-h-screen px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
