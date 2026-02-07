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

// Suppress harmless WebSocket errors and long-handler violations in console
if (typeof window !== 'undefined') {
  const originalError = console.error
  const originalWarn = console.warn

  console.error = (...args: unknown[]) => {
    const full = args.map(a => (a != null ? String(a) : '')).join(' ')
    if (
      full.includes('WebSocket is already in CLOSING') ||
      full.includes('WebSocket is already in CLOSED')
    ) {
      return
    }
    originalError.apply(console, args)
  }

  console.warn = (...args: unknown[]) => {
    const full = args.map(a => (a != null ? String(a) : '')).join(' ')
    if (full.includes("[Violation]") && full.includes('handler took')) {
      return
    }
    originalWarn.apply(console, args)
  }

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message ?? String(event.reason ?? '')
    if (
      typeof msg === 'string' &&
      (msg.includes('WebSocket is already in CLOSING') || msg.includes('WebSocket is already in CLOSED state'))
    ) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
