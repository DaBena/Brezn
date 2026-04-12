import { useEffect, useState } from 'react'
import type { BreznNostrClient } from '../lib/nostrClient'
import { applyBreznThemeToDocument } from '../lib/themeDom'

export function useTheme(client: BreznNostrClient) {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => client.getTheme())

  useEffect(() => {
    applyBreznThemeToDocument(theme)
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
