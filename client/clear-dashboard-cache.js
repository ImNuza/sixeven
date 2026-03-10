// Script to clear dashboard widget cache
// This helps reset the dashboard if localStorage contains stale widget data

const STORAGE_KEY_PREFIX = 'dashboard_widgets_v1'

// Get all keys in localstorage
const keys = Object.keys(localStorage)

// Find and remove dashboard widget keys
const dashboardKeys = keys.filter(key => key.startsWith(STORAGE_KEY_PREFIX))

console.log(`Found ${dashboardKeys.length} dashboard widget cache entries:`)
dashboardKeys.forEach(key => {
  console.log(`  - Removing: ${key}`)
  localStorage.removeItem(key)
})

// Also clear onboarding profile cache
const onboardingPrefix = 'onboarding_profile'
const onboardingKeys = keys.filter(key => key.startsWith(onboardingPrefix))
console.log(`\nFound ${onboardingKeys.length} onboarding profile cache entries:`)
onboardingKeys.forEach(key => {
  console.log(`  - Removing: ${key}`)
  localStorage.removeItem(key)
})

console.log('\n✅ Cache cleared! Reload the page to see if the dashboard now loads.')
