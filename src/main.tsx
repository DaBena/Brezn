import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root'
import { applyBreznThemeToDocument } from './lib/themeDom'

// Initialize theme from localStorage (before React renders to avoid flash)
function initializeTheme() {
  try {
    const stored = localStorage.getItem('brezn:v1')
    if (stored) {
      const parsed = JSON.parse(stored)
      const theme = parsed?.settings?.theme
      if (theme === 'light' || theme === 'dark') {
        applyBreznThemeToDocument(theme)
        return
      }
    }
  } catch {
    /* fall through */
  }
  applyBreznThemeToDocument('light')
}

initializeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
