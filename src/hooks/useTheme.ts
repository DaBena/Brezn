import { useEffect, useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'

export function useTheme(client: BreznNostrClient) {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => client.getTheme())

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Update color-scheme meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#161618' : '#f4f1ea')
    }
  }, [theme])

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme)
    client.setTheme(newTheme)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  return {
    theme,
    setTheme,
    toggleTheme,
  }
}
