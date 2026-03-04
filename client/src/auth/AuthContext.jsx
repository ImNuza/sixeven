import { createContext, useContext, useEffect, useState } from 'react'
import { clearStoredSession, loadStoredSession, saveStoredSession } from './storage.js'
import {
  changePassword as changePasswordRequest,
  deleteAccount as deleteAccountRequest,
  fetchCurrentUser,
  loginUser,
  registerUser,
  updateProfile as updateProfileRequest,
} from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadStoredSession())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const stored = loadStoredSession()
      if (!stored?.token) {
        if (!cancelled) {
          setIsReady(true)
        }
        return
      }

      try {
        const response = await fetchCurrentUser()
        const nextSession = {
          ...stored,
          user: response.user,
        }
        saveStoredSession(nextSession)
        if (!cancelled) {
          setSession(nextSession)
        }
      } catch {
        clearStoredSession()
        if (!cancelled) {
          setSession(null)
        }
      } finally {
        if (!cancelled) {
          setIsReady(true)
        }
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
    saveStoredSession(nextSession)
    setSession(nextSession)
    return nextSession
  }

  async function register(credentials) {
    const nextSession = await registerUser(credentials)
    saveStoredSession(nextSession)
    setSession(nextSession)
    return nextSession
  }

  function logout() {
    clearStoredSession()
    setSession(null)
  }

  async function changePassword(payload) {
    const nextSession = await changePasswordRequest(payload)
    saveStoredSession(nextSession)
    setSession(nextSession)
    return nextSession
  }

  async function updateProfile(payload) {
    const result = await updateProfileRequest(payload)
    const nextSession = {
      ...(loadStoredSession() || {}),
      token: session?.token || '',
      user: result.user,
    }
    saveStoredSession(nextSession)
    setSession(nextSession)
    return result
  }

  async function deleteAccount(payload) {
    const result = await deleteAccountRequest(payload)
    clearStoredSession()
    setSession(null)
    return result
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        token: session?.token || '',
        isAuthenticated: Boolean(session?.token),
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
