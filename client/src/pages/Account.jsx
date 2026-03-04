import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Mail, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Account() {
  const navigate = useNavigate()
  const { user, updateProfile, changePassword, deleteAccount } = useAuth()
  const [profileEmail, setProfileEmail] = useState(user?.email || '')
  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
  })
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
    if (!confirmed) {
      return
    }

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-accent">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Account Settings</h1>
            <p className="mt-1 text-sm text-white/45">
              Signed in as <span className="text-white/80">{user?.username}</span>.
            </p>
            <p className="mt-1 text-sm text-white/45">
              Recovery email: <span className="text-white/80">{user?.email || 'Not set yet'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <form onSubmit={handleProfileSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-accent">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Recovery Email</h2>
              <p className="text-sm text-white/45">Add an identity anchor for future cross-device account flows.</p>
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

          {profileError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {profileError}
            </div>
          ) : null}
          {profileMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {profileMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSavingProfile}
            className="app-button-primary inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60"
          >
            {isSavingProfile ? 'Saving...' : 'Save Email'}
          </button>
        </form>

        <form onSubmit={handlePasswordSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-cyan-300">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Change Password</h2>
              <p className="text-sm text-white/45">Rotate your credentials without losing your current account data.</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">Current Password</span>
            <input
              type="password"
              value={passwordValues.currentPassword}
              onChange={(event) => setPasswordValues((current) => ({ ...current, currentPassword: event.target.value }))}
              className="app-input mt-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium tracking-wide text-white/45 uppercase">New Password</span>
            <input
              type="password"
              value={passwordValues.newPassword}
              onChange={(event) => setPasswordValues((current) => ({ ...current, newPassword: event.target.value }))}
              className="app-input mt-2 text-sm"
              placeholder="Minimum 8 characters"
            />
          </label>

          {passwordError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {passwordError}
            </div>
          ) : null}
          {passwordMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {passwordMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isChanging}
            className="app-button-primary inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60"
          >
            {isChanging ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <form onSubmit={handleDeleteSubmit} className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-2 text-red-200">
              <Trash2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Delete Account</h2>
              <p className="text-sm text-white/45">This removes your user, assets, snapshots, and saved history.</p>
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

          {deleteError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {deleteError}
            </div>
          ) : null}
          {deleteMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {deleteMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isDeleting}
            className="app-button-danger inline-flex items-center justify-center px-5 py-3 text-sm disabled:opacity-60"
          >
            {isDeleting ? 'Deleting...' : 'Delete Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
