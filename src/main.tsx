import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root'

// Initialize theme from localStorage (before React renders to avoid flash)
// Default to 'light' for new users (existing preferences stay unchanged)
function initializeTheme() {
  try {
    const stored = localStorage.getItem('brezn:v1')
    if (stored) {
      const parsed = JSON.parse(stored)
      const theme = parsed?.settings?.theme
      if (theme === 'light' || theme === 'dark') {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        // Update theme-color meta tag
        const metaThemeColor = document.querySelector('meta[name="theme-color"]')
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', theme === 'dark' ? '#161618' : '#f4f1ea')
        }
        return
      }
    }
  } catch {
    // Ignore errors, fall back to light mode
  }
  // Default to light mode (no .dark class)
  document.documentElement.classList.remove('dark')
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', '#f4f1ea')
  }
}

initializeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
