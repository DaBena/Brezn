import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from '../locales/ar.json'
import de from '../locales/de.json'
import en from '../locales/en.json'
import es from '../locales/es.json'
import fa from '../locales/fa.json'
import fr from '../locales/fr.json'
import hi from '../locales/hi.json'
import it from '../locales/it.json'
import ja from '../locales/ja.json'
import ko from '../locales/ko.json'
import pl from '../locales/pl.json'
import pt from '../locales/pt.json'
import ru from '../locales/ru.json'
import tr from '../locales/tr.json'
import vi from '../locales/vi.json'
import zhCN from '../locales/zh-CN.json'
import nl from '../locales/nl.json'
import id from '../locales/id.json'
import uk from '../locales/uk.json'
import zhTW from '../locales/zh-TW.json'
import bn from '../locales/bn.json'
import th from '../locales/th.json'
import he from '../locales/he.json'
import { resolveNavigatorLocale } from './localeStorage'

const resources = {
  en: { translation: en },
  de: { translation: de },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  pt: { translation: pt },
  ru: { translation: ru },
  ja: { translation: ja },
  'zh-CN': { translation: zhCN },
  ar: { translation: ar },
  tr: { translation: tr },
  fa: { translation: fa },
  hi: { translation: hi },
  ko: { translation: ko },
  vi: { translation: vi },
  pl: { translation: pl },
  nl: { translation: nl },
  id: { translation: id },
  uk: { translation: uk },
  'zh-TW': { translation: zhTW },
  bn: { translation: bn },
  th: { translation: th },
  he: { translation: he },
} as const

const initialLng = resolveNavigatorLocale()

i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export { i18n }
