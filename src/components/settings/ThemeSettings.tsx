import { useTranslation } from 'react-i18next'
import { buttonBase } from '../../lib/buttonStyles'

type ThemeSettingsProps = {
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
}

export function ThemeSettings({ theme, onThemeChange }: ThemeSettingsProps) {
  const { t } = useTranslation()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const nextThemeLabel = nextTheme === 'dark' ? t('theme.switchToDark') : t('theme.switchToLight')

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold text-brezn-muted">{t('theme.label')}</div>
        <button
          type="button"
          onClick={() => onThemeChange(nextTheme)}
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${buttonBase}`}
        >
          {nextThemeLabel}
        </button>
      </div>
    </div>
  )
}
