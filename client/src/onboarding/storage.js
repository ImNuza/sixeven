const ONBOARDING_STORAGE_KEY = 'safeseven.onboarding'

export function loadOnboardingProfile() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveOnboardingProfile(profile) {
  if (typeof window === 'undefined') return
  if (profile) {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(profile))
  } else {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  }
  window.dispatchEvent(new Event('safeseven:onboarding'))
}
