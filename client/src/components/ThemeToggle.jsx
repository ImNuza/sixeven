import { Moon, SunMedium } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext.jsx'

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="app-button-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
      aria-label="Toggle theme"
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {isDark ? 'Light' : 'Dark'}
    </button>
  )
}
