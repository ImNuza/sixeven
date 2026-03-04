import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Mail, Moon, SunMedium, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useTheme } from '../theme/ThemeContext.jsx'

function initialsFor(username) {
  const letters = String(username || 'SS')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
  return letters || 'SS'
}

export default function Account() {
  const navigate = useNavigate()
  const { user, updateProfile, changePassword, deleteAccount } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const [profileEmail, setProfileEmail] = useState(user?.email || '')
  const [passwordValues, setPasswordValues] = useState({ currentPassword: '', newPassword: '' })
  const [deletePassword, setDeletePassword] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isChanging, setIsChanging] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleProfileSubmit(event) {
    event.preventDefault()
    try {
      setIsSavingProfile(true)
      setProfileError('')
      setProfileMessage('')
      await updateProfile({ email: profileEmail })
      setProfileMessage('Recovery email updated.')
    } catch (error) {
      setProfileError(error.message || 'Failed to update email.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault()
    try {
      setIsChanging(true)
      setPasswordError('')
      setPasswordMessage('')
      await changePassword(passwordValues)
      setPasswordValues({ currentPassword: '', newPassword: '' })
      setPasswordMessage('Password updated. Your session token was rotated.')
    } catch (error) {
      setPasswordError(error.message || 'Failed to change password.')
    } finally {
      setIsChanging(false)
    }
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault()
    const confirmed = window.confirm('Delete this account and all portfolio data? This cannot be undone.')
    if (!confirmed) return
    try {
      setIsDeleting(true)
      setDeleteError('')
      setDeleteMessage('')
      await deleteAccount({ password: deletePassword })
      setDeleteMessage('Account deleted.')
      navigate('/', { replace: true })
    } catch (error) {
      setDeleteError(error.message || 'Failed to delete account.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Profile header */}
      <div className="glass-card p-6 flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-400 text-xl font-bold text-white flex-shrink-0">
          {initialsFor(user?.username)}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">{user?.username || 'SafeSeven User'}</h1>
          <p className="text-sm text-white/40 mt-0.5">{user?.email || 'No recovery email set'}</p>
          <p className="text-xs text-white/25 mt-1">Private portfolio sync enabled</p>
        </div>
      </div>

      {/* Appearance */}
      <div className="glass-card p-6">
        <p className="app-kicker mb-4">Appearance</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/85">Theme</p>
            <p className="text-xs text-white/40 mt-0.5">{isDark ? 'Dark mode is active' : 'Light mode is active'}</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className={`relative inline-flex h-10 w-48 items-center justify-between rounded-2xl border px-1 transition-all duration-200 ${
              isDark
                ? 'border-white/10 bg-white/[0.04]'
                : 'border-black/10 bg-black/[0.04]'
            }`}
          >
            <span
              className={`absolute top-1 h-8 w-[88px] rounded-xl transition-all duration-200 ${
                isDark ? 'left-1 bg-white/10' : 'left-[94px] bg-black/10'
              }`}
            />
            <span className={`relative z-10 flex items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-200 ${isDark ? 'text-white/85' : 'text-white/30'}`}>
              <Moon className="h-3.5 w-3.5" /> Dark
            </span>
            <span className={`relative z-10 flex items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-200 ${!isDark ? 'text-black/70' : 'text-white/30'}`}>
              <SunMedium className="h-3.5 w-3.5" /> Light
            </span>
          </button>
        </div>
      </div>

      {/* Settings forms */}
      <div className="grid grid-cols-3 gap-5">
        <form onSubmit={handleProfileSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-accent">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Recovery Email</h2>
              <p className="text-xs text-white/40 mt-0.5">Identity anchor for future cross-device flows.</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Email</span>
            <input
              type="email"
              value={profileEmail}
              onChange={(event) => setProfileEmail(event.target.value)}
              className="app-input mt-2 text-sm"
              placeholder="you@example.com"
            />
          </label>

          {profileError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{profileError}</div>
          )}
          {profileMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{profileMessage}</div>
          )}

          <button type="submit" disabled={isSavingProfile} className="app-button-primary inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60">
            {isSavingProfile ? 'Saving...' : 'Save Email'}
          </button>
        </form>

        <form onSubmit={handlePasswordSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-cyan-300">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Change Password</h2>
              <p className="text-xs text-white/40 mt-0.5">Rotate credentials without losing account data.</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Current Password</span>
            <input
              type="password"
              value={passwordValues.currentPassword}
              onChange={(event) => setPasswordValues((c) => ({ ...c, currentPassword: event.target.value }))}
              className="app-input mt-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">New Password</span>
            <input
              type="password"
              value={passwordValues.newPassword}
              onChange={(event) => setPasswordValues((c) => ({ ...c, newPassword: event.target.value }))}
              className="app-input mt-2 text-sm"
              placeholder="Minimum 8 characters"
            />
          </label>

          {passwordError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{passwordError}</div>
          )}
          {passwordMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{passwordMessage}</div>
          )}

          <button type="submit" disabled={isChanging} className="app-button-primary inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60">
            {isChanging ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <form onSubmit={handleDeleteSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-2 text-red-200">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Delete Account</h2>
              <p className="text-xs text-white/40 mt-0.5">Removes your user, assets, and saved history.</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Confirm With Password</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className="app-input mt-2 text-sm"
            />
          </label>

          {deleteError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{deleteError}</div>
          )}
          {deleteMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{deleteMessage}</div>
          )}

          <button type="submit" disabled={isDeleting} className="app-button-danger inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60">
            {isDeleting ? 'Deleting...' : 'Delete Account'}
          </button>
        </form>
      </div>

    </div>
  )
}
