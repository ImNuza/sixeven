import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assets" element={<ComingSoon page="Assets" />} />
          <Route path="/add" element={<ComingSoon page="Add Asset" />} />
          <Route path="/insights" element={<ComingSoon page="Insights" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function ComingSoon({ page }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white/80">{page}</h2>
        <p className="text-sm text-white/30 mt-2">Coming in Phase 2</p>
      </div>
    </div>
  )
}
