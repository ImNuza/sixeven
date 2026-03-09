import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function ProtectedRoute() {
  const location = useLocation()
  const { isAuthenticated, isReady } = useAuth()

  if (!isReady) {
    return <div className="min-h-screen bg-navy-900 px-8 py-10 text-sm text-white/70">Restoring your SafeSeven session...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}
