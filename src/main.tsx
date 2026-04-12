import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import { i18n } from './i18n/i18n'
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
    <I18nextProvider i18n={i18n}>
      <Root />
    </I18nextProvider>
  </StrictMode>,
)
