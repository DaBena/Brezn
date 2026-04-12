import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveNavigatorLocale } from '../i18n/localeStorage'

/** Keep `html` `lang` / `dir` in sync with i18n (RTL for Arabic & Persian). */
export function useBreznDocumentLang(): void {
  const { i18n } = useTranslation()

  useEffect(() => {
    const lng = i18n.language
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng
      document.documentElement.dir = lng === 'ar' || lng === 'fa' ? 'rtl' : 'ltr'
    }
  }, [i18n.language])

  useEffect(() => {
    const onNavigatorLanguageChange = () => {
      void i18n.changeLanguage(resolveNavigatorLocale())
    }
    window.addEventListener('languagechange', onNavigatorLanguageChange)
    return () => window.removeEventListener('languagechange', onNavigatorLanguageChange)
  }, [i18n])
}
