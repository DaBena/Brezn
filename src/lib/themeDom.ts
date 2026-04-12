import { readCssVar } from './readCssVar'

export type BreznThemeMode = 'light' | 'dark'

/** Toggle `html.dark` and sync `theme-color` from CSS variables (single place for main + React). */
export function applyBreznThemeToDocument(theme: BreznThemeMode): void {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', readCssVar('--brezn-meta-theme', '#f4f1ea'))
}
