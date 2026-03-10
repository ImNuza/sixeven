const ONBOARDING_STORAGE_PREFIX = 'safeseven.onboarding.'
const LEGACY_ONBOARDING_STORAGE_KEY = 'safeseven.onboarding'

function normalizeUserId(userId) {
  if (userId == null) return ''
  const parsed = Number.parseInt(String(userId), 10)
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : ''
}

function keyForUser(userId) {
  const id = normalizeUserId(userId)
  return id ? `${ONBOARDING_STORAGE_PREFIX}${id}` : ''
}

export function loadOnboardingProfile(userId) {
  if (typeof window === 'undefined') return null
  const key = keyForUser(userId)
  if (!key) return null
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) return JSON.parse(raw)

    // One-time migration path from legacy global key to user-scoped key.
    const legacyRaw = window.localStorage.getItem(LEGACY_ONBOARDING_STORAGE_KEY)
    if (!legacyRaw) return null
    const parsed = JSON.parse(legacyRaw)
    if (parsed?.userId && String(parsed.userId) === normalizeUserId(userId)) {
      window.localStorage.setItem(key, legacyRaw)
      window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY)
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveOnboardingProfile(profile, userId) {
  if (typeof window === 'undefined') return
  const resolvedUserId = normalizeUserId(userId ?? profile?.userId)
  const key = keyForUser(resolvedUserId)
  if (!key) return
  if (profile) {
    const safe = { ...profile, userId: Number(resolvedUserId) }
    window.localStorage.setItem(key, JSON.stringify(safe))
  } else {
    window.localStorage.removeItem(key)
  }
  // Remove old non-scoped key so profiles cannot bleed between accounts.
  window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY)
  window.dispatchEvent(new Event('safeseven:onboarding'))
}

export function clearOnboardingProfile(userId) {
  if (typeof window === 'undefined') return
  const key = keyForUser(userId)
  if (key) window.localStorage.removeItem(key)
  window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY)
  window.dispatchEvent(new Event('safeseven:onboarding'))
}

export function clearOnboardingProfilesExcept(userId) {
  if (typeof window === 'undefined') return
  const keepKey = keyForUser(userId)
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i)
    if (!key) continue
    if (key.startsWith(ONBOARDING_STORAGE_PREFIX) && key !== keepKey) {
      window.localStorage.removeItem(key)
    }
  }
  window.localStorage.removeItem(LEGACY_ONBOARDING_STORAGE_KEY)
  window.dispatchEvent(new Event('safeseven:onboarding'))
}
