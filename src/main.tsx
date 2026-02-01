import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root'

// Initialize theme from localStorage (before React renders to avoid flash)
// Default to 'dark' for backward compatibility
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
    // Ignore errors, fall back to dark mode
  }
  // Default to dark mode
  document.documentElement.classList.add('dark')
}

initializeTheme()

// Suppress harmless WebSocket errors from nostr-tools SimplePool
// These occur when a WebSocket is closed while already closing/closed (race condition)
// The errors are harmless and can be safely ignored
if (typeof window !== 'undefined') {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const message = args[0]?.toString() || ''
    // Suppress "WebSocket is already in CLOSING or CLOSED state" errors
    if (message.includes('WebSocket is already in CLOSING') || message.includes('WebSocket is already in CLOSED')) {
      return // Silently ignore
    }
    originalError.apply(console, args)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
