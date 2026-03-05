import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import AddAsset from './pages/AddAsset'
import Insights from './pages/Insights'
import Account from './pages/Account'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/connect" element={<Navigate to="/account" replace />} />
            <Route path="/add" element={<AddAsset />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/account" element={<Account />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
