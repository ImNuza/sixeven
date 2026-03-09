/**
 * Client-side session storage
 *
 * Tokens are now carried as httpOnly cookies (set by the server) and are
 * never accessible from JavaScript. We only persist the user object in
 * localStorage so the UI can display the username immediately on page load
 * without waiting for the /me round-trip.
 */
const AUTH_STORAGE_KEY = 'safeseven.auth'

export function loadStoredSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Persist only the user object — never store the token client-side. */
export function saveStoredSession(session) {
  if (typeof window === 'undefined') return
  const safe = session?.user ? { user: session.user } : null
  if (safe) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safe))
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
  window.dispatchEvent(new Event('safeseven:auth'))
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  window.dispatchEvent(new Event('safeseven:auth'))
}

/** Always returns empty — tokens are in httpOnly cookies, not localStorage. */
export function getStoredToken() {
  return ''
}
