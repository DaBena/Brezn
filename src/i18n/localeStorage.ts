/** BCP 47 codes supported by Brezn UI. */
export const SUPPORTED_LOCALES = [
  'en',
  'de',
  'es',
  'fr',
  'it',
  'pt',
  'ru',
  'ja',
  'zh-CN',
  'ar',
  'tr',
  'fa',
  'hi',
  'ko',
  'vi',
  'pl',
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(code: string | null | undefined): code is SupportedLocale {
  return Boolean(code && (SUPPORTED_LOCALES as readonly string[]).includes(code))
}

/**
 * Map `navigator.language` / `navigator.languages` to a supported UI locale.
 * Used instead of a manual language picker (follows browser preferences).
 */
export function resolveNavigatorLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return 'en'

  const list: string[] = []
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    list.push(...navigator.languages)
  }
  if (navigator.language) list.push(navigator.language)

  for (const raw of list) {
    if (!raw) continue
    const norm = raw.trim().toLowerCase().replace(/_/g, '-')

    if (norm.startsWith('zh')) {
      return 'zh-CN'
    }

    if (isSupportedLocale(norm)) {
      return norm
    }

    const primary = norm.split('-')[0]
    if (isSupportedLocale(primary)) {
      return primary
    }
  }

  return 'en'
}
