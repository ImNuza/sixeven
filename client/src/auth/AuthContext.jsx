import { createContext, useContext, useEffect, useState } from 'react'
import { clearStoredSession, loadStoredSession, saveStoredSession } from './storage.js'
import { clearOnboardingProfilesExcept } from '../onboarding/storage.js'
import {
  changePassword as changePasswordRequest,
  deleteAccount as deleteAccountRequest,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  updateProfile as updateProfileRequest,
} from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Hydrate from localStorage for instant display (user object only — no token)
  const [session, setSession] = useState(() => {
    const stored = loadStoredSession()
    return stored?.user ? stored : null
  })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      // Always validate against the server — the httpOnly cookie is the real auth signal.
      // If no cookie exists the request returns 401 and we clear local state.
      try {
        const response = await fetchCurrentUser()
        const nextSession = { user: response.user }
        saveStoredSession(nextSession)
        if (!cancelled) setSession(nextSession)
      } catch {
        clearStoredSession()
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setIsReady(true)
      }
    }

    function syncSession() {
      setSession(loadStoredSession())
    }

    restoreSession()
    window.addEventListener('storage', syncSession)
    window.addEventListener('safeseven:auth', syncSession)
    return () => {
      cancelled = true
      window.removeEventListener('storage', syncSession)
      window.removeEventListener('safeseven:auth', syncSession)
    }
  }, [])

  async function login(credentials) {
    const nextSession = await loginUser(credentials)
    const safe = { user: nextSession.user }
    clearOnboardingProfilesExcept(nextSession.user?.id)
    saveStoredSession(safe)
    setSession(safe)
    return nextSession
  }

  async function register(credentials) {
    const nextSession = await registerUser(credentials)
    const safe = { user: nextSession.user }
    clearOnboardingProfilesExcept(nextSession.user?.id)
    saveStoredSession(safe)
    setSession(safe)
    return nextSession
  }

  async function logout() {
    try { await logoutUser() } catch { /* best effort — server revokes token */ }
    clearOnboardingProfilesExcept(null)
    clearStoredSession()
    setSession(null)
  }

  async function changePassword(payload) {
    const nextSession = await changePasswordRequest(payload)
    const safe = { user: nextSession.user }
    saveStoredSession(safe)
    setSession(safe)
    return nextSession
  }

  async function updateProfile(payload) {
    const result = await updateProfileRequest(payload)
    const nextSession = { user: result.user }
    clearOnboardingProfilesExcept(nextSession.user?.id)
    saveStoredSession(nextSession)
    setSession(nextSession)
    return result
  }

  async function deleteAccount(payload) {
    const result = await deleteAccountRequest(payload)
    clearOnboardingProfilesExcept(null)
    clearStoredSession()
    setSession(null)
    return result
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        isAuthenticated: Boolean(session?.user),
        isReady,
        login,
        register,
        updateProfile,
        changePassword,
        deleteAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return value
}
